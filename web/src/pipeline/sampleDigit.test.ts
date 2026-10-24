import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { SAMPLE_DIGIT_NAME, SAMPLE_DIGIT_URL, loadSampleDigit } from './sampleDigit'

afterEach(() => vi.unstubAllGlobals())

describe('loadSampleDigit', () => {
  it('fetches the bundled PNG and wraps it as a File', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(new Uint8Array([0x89, 0x50]), { status: 200 }))
    vi.stubGlobal('fetch', mock)

    const file = await loadSampleDigit()
    expect(mock).toHaveBeenCalledWith(SAMPLE_DIGIT_URL)
    expect(file).toBeInstanceOf(File)
    expect(file.name).toBe(SAMPLE_DIGIT_NAME)
    expect(file.type).toBe('image/png')
    expect(file.size).toBe(2)
  })

  it('rejects with SAMPLE_UNAVAILABLE on a 404', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })))
    const error = await loadSampleDigit().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'SAMPLE_UNAVAILABLE', status: 404 })
  })
})
