import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { uploadImage } from './inferences'

const file = new File(['x'], 'digit.png', { type: 'image/png' })

const example = {
  id: '3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21',
  upload: {
    filename: 'digit.png',
    declared_mime: 'image/png',
    detected_mime: 'image/png',
    bytes: 108,
  },
}

function stubFetch(response: Response) {
  const mock = vi.fn().mockResolvedValue(response)
  vi.stubGlobal('fetch', mock)
  return mock
}

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status })
}

afterEach(() => vi.unstubAllGlobals())

describe('uploadImage', () => {
  it('posts the file as multipart form data without a Content-Type header', async () => {
    const mock = stubFetch(jsonResponse(example, 201))
    await uploadImage(file)

    expect(mock).toHaveBeenCalledTimes(1)
    const [url, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(url.endsWith('/api/inferences')).toBe(true)
    expect(init.method).toBe('POST')
    expect(init.body).toBeInstanceOf(FormData)
    expect((init.body as FormData).get('image')).toBe(file)
    expect(init.headers).toBeUndefined()
  })

  it('resolves to the parsed body on 201', async () => {
    stubFetch(jsonResponse(example, 201))
    await expect(uploadImage(file)).resolves.toEqual(example)
  })

  it('rejects with the server error code on 400', async () => {
    stubFetch(jsonResponse({ error: { code: 'INVALID_IMAGE', message: 'x' } }, 400))
    const error = await uploadImage(file).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'INVALID_IMAGE', status: 400, message: 'x' })
  })

  it('rejects with FILE_TOO_LARGE on 413', async () => {
    stubFetch(jsonResponse({ error: { code: 'FILE_TOO_LARGE', message: 'big' } }, 413))
    const error = await uploadImage(file).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'FILE_TOO_LARGE', status: 413 })
  })

  it('maps a rejected fetch to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    const error = await uploadImage(file).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })

  it('maps a non-JSON error body to UNKNOWN_ERROR', async () => {
    stubFetch(new Response('<html>oops</html>', { status: 500 }))
    const error = await uploadImage(file).catch((e: unknown) => e)
    expect(error).toMatchObject({ code: 'UNKNOWN_ERROR', status: 500 })
  })
})
