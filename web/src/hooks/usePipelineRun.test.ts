import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { uploadImage } from '../api/inferences'
import type { InferenceResponse } from '../api/types'
import { PLAYBACK_FIXTURE } from '../pipeline/fixtures/playbackRun'
import { loadSampleDigit } from '../pipeline/sampleDigit'
import { usePipelineRun } from './usePipelineRun'

vi.mock('../api/inferences', () => ({ uploadImage: vi.fn() }))
vi.mock('../pipeline/sampleDigit', () => ({ loadSampleDigit: vi.fn() }))

const file = new File(['x'], 'digit.png', { type: 'image/png' })
const response: InferenceResponse = {
  id: '3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21',
  upload: {
    filename: 'digit.png',
    declared_mime: 'image/png',
    detected_mime: 'image/png',
    bytes: 1,
    width: 20,
    height: 10,
    format: 'PNG',
  },
  stages: PLAYBACK_FIXTURE.stages.slice(0, 10),
}

const mockedUpload = vi.mocked(uploadImage)
const mockedSample = vi.mocked(loadSampleDigit)

beforeEach(() => {
  mockedUpload.mockReset()
  mockedSample.mockReset()
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: vi.fn() }))
})

afterEach(() => vi.unstubAllGlobals())

describe('usePipelineRun', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => usePipelineRun())
    expect(result.current.state).toEqual({ status: 'idle' })
  })

  it('uploads, then plays the stages the backend returned with a local preview', async () => {
    let resolve: (value: InferenceResponse) => void = () => {}
    mockedUpload.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result } = renderHook(() => usePipelineRun())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = result.current.submit(file)
    })
    expect(result.current.state).toEqual({ status: 'uploading', file })

    await act(async () => {
      resolve(response)
      await pending
    })
    expect(result.current.state).toEqual({
      status: 'playing',
      run: { id: response.id, filename: 'digit.png', preview: 'blob:preview', stages: response.stages },
    })
  })

  it('turns a stage-aware server error into a failure with the stages that finished', async () => {
    const body = {
      error: { code: 'NO_DIGIT_FOUND', message: 'No ink.', stage: 'crop' as const, detail: 'gap 39 (needs 50)' },
      stages: response.stages.slice(0, 7),
    }
    mockedUpload.mockRejectedValue(new ApiError('NO_DIGIT_FOUND', 'No ink.', 400, body))
    const { result } = renderHook(() => usePipelineRun())

    await act(() => result.current.submit(file))
    expect(result.current.state).toMatchObject({
      status: 'failed',
      failure: { origin: 'server', stage: 'crop', httpStatus: 400, detail: 'gap 39 (needs 50)', response: body },
    })
    if (result.current.state.status === 'failed') {
      expect(result.current.state.failure.completed).toHaveLength(7)
    }
  })

  it('reports no response at all as a network failure', async () => {
    mockedUpload.mockRejectedValue(new ApiError('NETWORK_ERROR', 'Could not reach the backend.', 0))
    const { result } = renderHook(() => usePipelineRun())
    await act(() => result.current.submit(file))
    expect(result.current.state).toMatchObject({ status: 'failed', failure: { origin: 'network', completed: [] } })
  })

  it('sends the sample digit through the same upload', async () => {
    const sample = new File(['png'], 'sample-digit.png', { type: 'image/png' })
    mockedSample.mockResolvedValue(sample)
    mockedUpload.mockResolvedValue(response)
    const { result } = renderHook(() => usePipelineRun())

    await act(() => result.current.submitSample())
    expect(mockedUpload).toHaveBeenCalledWith(sample)
    expect(result.current.state.status).toBe('playing')
  })

  it('stops an oversized file in the browser as a Validated failure', () => {
    const { result } = renderHook(() => usePipelineRun())
    act(() => result.current.reject({ file, reason: 'size' }))
    expect(result.current.state).toMatchObject({
      status: 'failed',
      failure: { origin: 'browser', code: 'FILE_TOO_LARGE', stage: 'validated' },
    })
  })

  it('frees the preview when the visitor starts over', async () => {
    mockedUpload.mockResolvedValue(response)
    const { result } = renderHook(() => usePipelineRun())
    await act(() => result.current.submit(file))
    act(() => result.current.reset())
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    expect(result.current.state).toEqual({ status: 'idle' })
  })
})
