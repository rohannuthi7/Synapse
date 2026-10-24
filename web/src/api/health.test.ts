import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from './client'
import { getHealth } from './health'

const body = { status: 'ok', version: '0.4', commit: '3fa1c2e' }

afterEach(() => vi.unstubAllGlobals())

describe('getHealth', () => {
  it('GETs /api/health and resolves to the parsed body', async () => {
    const mock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }))
    vi.stubGlobal('fetch', mock)

    await expect(getHealth()).resolves.toEqual(body)
    const [url, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(url.endsWith('/api/health')).toBe(true)
    expect(init.method).toBe('GET')
  })

  it('maps a rejected fetch to NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')))
    const error = await getHealth().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 })
  })
})
