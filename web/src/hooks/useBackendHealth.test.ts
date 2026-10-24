import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api/client'
import { getHealth } from '../api/health'
import { useBackendHealth } from './useBackendHealth'

vi.mock('../api/health', () => ({ getHealth: vi.fn() }))

const mockedHealth = vi.mocked(getHealth)
const online = { status: 'ok', version: '0.4', commit: '3fa1c2e', board: 'emulated' } as const

beforeEach(() => {
  vi.useFakeTimers()
  mockedHealth.mockReset()
})

afterEach(() => vi.useRealTimers())

describe('useBackendHealth', () => {
  it('starts as checking, then reports version and commit', async () => {
    mockedHealth.mockResolvedValue(online)
    const { result } = renderHook(() => useBackendHealth())
    expect(result.current).toEqual({ status: 'checking' })

    await act(async () => {})
    expect(result.current).toEqual({ status: 'online', version: '0.4', commit: '3fa1c2e', board: 'emulated' })
  })

  it('reports offline when the request fails', async () => {
    mockedHealth.mockRejectedValue(new ApiError('NETWORK_ERROR', 'x', 0))
    const { result } = renderHook(() => useBackendHealth())

    await act(async () => {})
    expect(result.current).toEqual({ status: 'offline' })
  })

  it('polls, so a backend that comes back is shown as online', async () => {
    mockedHealth.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 'x', 0))
    mockedHealth.mockResolvedValue(online)
    const { result } = renderHook(() => useBackendHealth(1000))

    await act(async () => {})
    expect(result.current.status).toBe('offline')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000)
    })
    expect(result.current.status).toBe('online')
    expect(mockedHealth).toHaveBeenCalledTimes(2)
  })

  it('stops polling and aborts the request on unmount', async () => {
    mockedHealth.mockResolvedValue(online)
    const { unmount } = renderHook(() => useBackendHealth(1000))
    await act(async () => {})

    const signal = mockedHealth.mock.calls[0][0] as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)

    await vi.advanceTimersByTimeAsync(5000)
    expect(mockedHealth).toHaveBeenCalledTimes(1)
  })
})
