import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { uploadImage } from '../api/inferences'
import type { InferenceResponse } from '../api/types'
import { loadSampleDigit } from '../pipeline/sampleDigit'
import { useUploadDigit } from './useUploadDigit'

vi.mock('../api/inferences', () => ({ uploadImage: vi.fn() }))
vi.mock('../pipeline/sampleDigit', () => ({ loadSampleDigit: vi.fn() }))

const file = new File(['x'], 'digit.png', { type: 'image/png' })
const result: InferenceResponse = {
  id: '3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21',
  upload: {
    filename: 'digit.png',
    declared_mime: 'image/png',
    detected_mime: 'image/png',
    bytes: 108,
    width: 20,
    height: 10,
    format: 'PNG',
  },
}

const mockedUpload = vi.mocked(uploadImage)
const mockedSample = vi.mocked(loadSampleDigit)

beforeEach(() => {
  mockedUpload.mockReset()
  mockedSample.mockReset()
})

describe('useUploadDigit', () => {
  it('starts idle', () => {
    const { result: hook } = renderHook(() => useUploadDigit())
    expect(hook.current.state).toEqual({ status: 'idle' })
  })

  it('moves from uploading to done with the result', async () => {
    let resolve: (value: InferenceResponse) => void = () => {}
    mockedUpload.mockReturnValue(new Promise((r) => (resolve = r)))
    const { result: hook } = renderHook(() => useUploadDigit())

    let pending: Promise<void> = Promise.resolve()
    act(() => {
      pending = hook.current.submit(file)
    })
    expect(hook.current.state).toEqual({ status: 'uploading', file })

    await act(async () => {
      resolve(result)
      await pending
    })
    expect(hook.current.state).toEqual({ status: 'done', file, result })
  })

  it('moves to error with a rejected ApiError', async () => {
    const apiError = new ApiError('INVALID_IMAGE', 'bad', 400)
    mockedUpload.mockImplementation(async () => {
      throw apiError
    })
    const { result: hook } = renderHook(() => useUploadDigit())

    await act(() => hook.current.submit(file))
    expect(hook.current.state).toEqual({ status: 'error', error: apiError })
  })

  it('wraps a plain Error as UNKNOWN_ERROR', async () => {
    mockedUpload.mockImplementation(async () => {
      throw new Error('boom')
    })
    const { result: hook } = renderHook(() => useUploadDigit())

    await act(() => hook.current.submit(file))
    expect(hook.current.state).toMatchObject({
      status: 'error',
      error: { code: 'UNKNOWN_ERROR' },
    })
  })

  it('uploads the sample digit through the same path as a picked file', async () => {
    const sample = new File(['png'], 'sample-digit.png', { type: 'image/png' })
    mockedSample.mockResolvedValue(sample)
    mockedUpload.mockResolvedValue(result)
    const { result: hook } = renderHook(() => useUploadDigit())

    await act(() => hook.current.submitSample())
    expect(mockedUpload).toHaveBeenCalledWith(sample)
    expect(hook.current.state).toEqual({ status: 'done', file: sample, result })
  })

  it('moves to error without uploading when the sample cannot load', async () => {
    const apiError = new ApiError('SAMPLE_UNAVAILABLE', 'x', 404)
    mockedSample.mockRejectedValue(apiError)
    const { result: hook } = renderHook(() => useUploadDigit())

    await act(() => hook.current.submitSample())
    expect(mockedUpload).not.toHaveBeenCalled()
    expect(hook.current.state).toEqual({ status: 'error', error: apiError })
  })

  it('records a client-side rejection, and reset returns to idle', () => {
    const { result: hook } = renderHook(() => useUploadDigit())
    const rejection = { file, reason: 'size' } as const

    act(() => hook.current.reject(rejection))
    expect(hook.current.state).toEqual({ status: 'rejected', rejection })

    act(() => hook.current.reset())
    expect(hook.current.state).toEqual({ status: 'idle' })
  })
})
