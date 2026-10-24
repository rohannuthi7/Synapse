import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StageTiming } from '../pipeline/motion'
import { usePlayback } from './usePlayback'

const TIMINGS: StageTiming[] = [
  { phases: [], endMs: 0, holdMs: 600 },
  { phases: [[30, 1]], endMs: 430, holdMs: 900 },
  { phases: [[30, 1]], endMs: 430, holdMs: 0 },
]

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function key(name: string, overrides: Partial<KeyboardEvent<HTMLElement>> = {}) {
  return {
    key: name,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    target: document.createElement('main'),
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent<HTMLElement>
}

describe('usePlayback', () => {
  it('starts playing on mount and advances on its own', () => {
    const { result } = renderHook(() => usePlayback(TIMINGS, false))
    expect(result.current.state).toMatchObject({ index: 0, playing: true })
    act(() => vi.advanceTimersByTime(600))
    expect(result.current.state.index).toBe(1)
  })

  it('starts paused with reduced motion', () => {
    const { result } = renderHook(() => usePlayback(TIMINGS, true))
    expect(result.current.state).toMatchObject({ playing: false, settled: true })
  })

  it('settles and pauses when reduced motion turns on', () => {
    const { result, rerender } = renderHook(({ reduced }) => usePlayback(TIMINGS, reduced), {
      initialProps: { reduced: false },
    })
    rerender({ reduced: true })
    expect(result.current.state).toMatchObject({ playing: false, reducedMotion: true })
  })

  it('clears its timers on unmount', () => {
    const { unmount } = renderHook(() => usePlayback(TIMINGS, false))
    expect(vi.getTimerCount()).toBeGreaterThan(0)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('steps with the arrow keys', () => {
    const { result } = renderHook(() => usePlayback(TIMINGS, false))
    const right = key('ArrowRight')
    act(() => result.current.onKeyDown(right))
    expect(result.current.state.index).toBe(1)
    expect(right.preventDefault).toHaveBeenCalled()

    act(() => result.current.onKeyDown(key('ArrowLeft')))
    expect(result.current.state).toMatchObject({ index: 0, playing: false })
  })

  it('toggles with space, but leaves space alone on buttons', () => {
    const { result } = renderHook(() => usePlayback(TIMINGS, false))
    act(() => result.current.onKeyDown(key(' ')))
    expect(result.current.state.playing).toBe(false)

    const onButton = key(' ', { target: document.createElement('button') })
    act(() => result.current.onKeyDown(onButton))
    expect(result.current.state.playing).toBe(false)
    expect(onButton.preventDefault).not.toHaveBeenCalled()
  })

  it('replays with R, but not with Ctrl+R (browser reload)', () => {
    const { result } = renderHook(() => usePlayback(TIMINGS, false))
    act(() => result.current.onKeyDown(key('ArrowRight')))
    act(() => result.current.onKeyDown(key('r', { ctrlKey: true })))
    expect(result.current.state.index).toBe(1)

    act(() => result.current.onKeyDown(key('R')))
    expect(result.current.state).toMatchObject({ index: 0, playing: true })
  })
})
