import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAYBACK_FIXTURE } from '../pipeline/fixtures/playbackRun'
import { stageTimings } from '../pipeline/motion'
import type { StageTiming } from '../pipeline/motion'
import { PlaybackController } from './PlaybackController'

// 0: no change, 1: animated, 2: no change, 3: animated and last.
const TIMINGS: StageTiming[] = [
  { phases: [], endMs: 0, holdMs: 600 },
  { phases: [[30, 1]], endMs: 430, holdMs: 900 },
  { phases: [], endMs: 0, holdMs: 300 },
  { phases: [[30, 1]], endMs: 840, holdMs: 0 },
]

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const started = (options?: ConstructorParameters<typeof PlaybackController>[1]) => {
  const controller = new PlaybackController(TIMINGS, options)
  controller.start()
  return controller
}

describe('PlaybackController', () => {
  it('auto-plays every stage with its transition and hold, then finishes', () => {
    const c = started()
    expect(c.getSnapshot()).toMatchObject({ index: 0, reached: 0, playing: true })

    vi.advanceTimersByTime(599)
    expect(c.getSnapshot().index).toBe(0)
    vi.advanceTimersByTime(1) // 600: hold after stage 0
    expect(c.getSnapshot()).toMatchObject({ index: 1, phase: 0, settled: false })
    vi.advanceTimersByTime(30) // 630: the animation's first phase
    expect(c.getSnapshot().phase).toBe(1)

    vi.advanceTimersByTime(430 + 900 - 30) // 1930: end of animation plus hold
    expect(c.getSnapshot().index).toBe(2)
    vi.advanceTimersByTime(300) // 2230
    expect(c.getSnapshot()).toMatchObject({ index: 3, finished: false, playing: true })

    vi.advanceTimersByTime(840) // 3070: last transition done
    expect(c.getSnapshot()).toMatchObject({ index: 3, reached: 3, finished: true, playing: false })
  })

  it('divides holds and motion by the speed, but not the first-paint delay', () => {
    const c = started({ speed: 2 })
    vi.advanceTimersByTime(299)
    expect(c.getSnapshot().index).toBe(0)
    vi.advanceTimersByTime(1) // 300: 600ms hold at 2×
    expect(c.getSnapshot().index).toBe(1)

    vi.advanceTimersByTime(29)
    expect(c.getSnapshot().phase).toBe(0)
    vi.advanceTimersByTime(1) // 30ms at any speed, so phase 0 is painted
    expect(c.getSnapshot().phase).toBe(1)

    // Motion (430 - 30) and hold (900), both halved, after the paint delay.
    vi.advanceTimersByTime(200 + 450 - 1)
    expect(c.getSnapshot().index).toBe(1)
    vi.advanceTimersByTime(1)
    expect(c.getSnapshot().index).toBe(2)
  })

  it('applies a speed change to the next delay it schedules', () => {
    const c = started()
    c.setSpeed(0.5)
    vi.advanceTimersByTime(600) // already scheduled at 1×
    expect(c.getSnapshot().index).toBe(1)
    // From here at 0.5×: 30 + 400 × 2 of motion, then 900 × 2 of hold.
    vi.advanceTimersByTime(30 + 800 + 1800 - 1)
    expect(c.getSnapshot().index).toBe(1)
    vi.advanceTimersByTime(1)
    expect(c.getSnapshot().index).toBe(2)
  })

  it('pause stops on the current stage, settled, and play moves on', () => {
    const c = started()
    vi.advanceTimersByTime(610)
    c.pause()
    expect(c.getSnapshot()).toMatchObject({ index: 1, playing: false, settled: true })
    vi.advanceTimersByTime(10_000)
    expect(c.getSnapshot().index).toBe(1)

    c.play()
    expect(c.getSnapshot()).toMatchObject({ index: 2, playing: true })
  })

  it('next animates and keeps playing; previous is instant and pauses', () => {
    const c = started()
    c.next()
    expect(c.getSnapshot()).toMatchObject({ index: 1, settled: false, playing: true })

    c.previous()
    expect(c.getSnapshot()).toMatchObject({ index: 0, settled: true, playing: false })
    vi.advanceTimersByTime(10_000)
    expect(c.getSnapshot().index).toBe(0)
  })

  it('previous stays on the first stage', () => {
    const c = started()
    c.previous()
    expect(c.getSnapshot().index).toBe(0)
  })

  it('next does nothing on the last stage', () => {
    const c = started()
    vi.advanceTimersByTime(5000)
    c.next()
    expect(c.getSnapshot()).toMatchObject({ index: 3, finished: true })
  })

  it('jumps only to stages already reached, instantly, and pauses', () => {
    const c = started()
    c.jumpTo(2)
    expect(c.getSnapshot().index).toBe(0)

    vi.advanceTimersByTime(2230) // reached stage 3
    c.jumpTo(1)
    expect(c.getSnapshot()).toMatchObject({ index: 1, reached: 3, settled: true, playing: false })
  })

  it('replay starts over from the first stage and forgets how far it got', () => {
    const c = started()
    vi.advanceTimersByTime(5000)
    c.replay()
    expect(c.getSnapshot()).toMatchObject({ index: 0, reached: 0, playing: true, finished: false })
  })

  it('play on the finished last stage replays', () => {
    const c = started()
    vi.advanceTimersByTime(5000)
    c.togglePlay()
    expect(c.getSnapshot()).toMatchObject({ index: 0, playing: true })
  })

  describe('with reduced motion', () => {
    it('starts paused and shows every stage settled', () => {
      const c = started({ reducedMotion: true })
      expect(c.getSnapshot()).toMatchObject({ index: 0, playing: false, settled: true })
      vi.advanceTimersByTime(10_000)
      expect(c.getSnapshot().index).toBe(0)

      c.next()
      expect(c.getSnapshot()).toMatchObject({ index: 1, settled: true, phase: 0 })
    })

    it('pauses and settles when switched on mid-animation', () => {
      const c = started()
      vi.advanceTimersByTime(610)
      c.setReducedMotion(true)
      expect(c.getSnapshot()).toMatchObject({ index: 1, playing: false, settled: true })
    })
  })

  it('dispose cancels pending timers', () => {
    const c = started()
    c.dispose()
    vi.advanceTimersByTime(10_000)
    expect(c.getSnapshot().index).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('notifies subscribers on every change until unsubscribed', () => {
    const c = new PlaybackController(TIMINGS)
    const listener = vi.fn()
    const unsubscribe = c.subscribe(listener)
    c.start()
    expect(listener).toHaveBeenCalled()

    listener.mockClear()
    unsubscribe()
    c.next()
    expect(listener).not.toHaveBeenCalled()
  })

  it('plays the fixture run end to end in 14.84s at 1×', () => {
    const c = new PlaybackController(stageTimings(PLAYBACK_FIXTURE.stages))
    c.start()
    vi.advanceTimersByTime(14_839)
    expect(c.getSnapshot()).toMatchObject({ index: 11, finished: false })
    vi.advanceTimersByTime(1)
    expect(c.getSnapshot()).toMatchObject({ index: 11, finished: true })
  })
})
