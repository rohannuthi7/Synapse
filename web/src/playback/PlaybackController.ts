import type { StageTiming } from '../pipeline/motion'
import { FIRST_PAINT_MS, HOLD_AFTER_NO_CHANGE_MS } from '../pipeline/motion'

export type PlaybackSpeed = 0.5 | 1 | 2
export const PLAYBACK_SPEEDS: readonly PlaybackSpeed[] = [0.5, 1, 2]

export interface PlaybackState {
  /** Stage on screen. */
  index: number
  /** Furthest stage reached this run; -1 before the first. Earlier stages can be jumped to. */
  reached: number
  /** Transition phase of the stage on screen; 0 is its starting picture. */
  phase: number
  /** Shown in its final form with no motion: after a jump, a pause, or with reduced motion. */
  settled: boolean
  playing: boolean
  /** The last stage is on screen and its transition has finished. */
  finished: boolean
  speed: PlaybackSpeed
  reducedMotion: boolean
  /**
   * Goes up every time a stage is entered, so state tied to one visit (such
   * as a toggled view) can tell that the visit is over.
   */
  entry: number
}

type Listener = () => void

/**
 * Steps through a run's stages on a timer. Framework-free so its timing can
 * be tested with fake timers; usePlayback adapts it to React. Every delay but
 * the first paint is divided by the speed in effect when it is scheduled.
 */
export class PlaybackController {
  private state: PlaybackState
  private timers: ReturnType<typeof setTimeout>[] = []
  private readonly listeners = new Set<Listener>()
  private readonly timings: readonly StageTiming[]

  constructor(
    timings: readonly StageTiming[],
    { reducedMotion = false, speed = 1 }: { reducedMotion?: boolean; speed?: PlaybackSpeed } = {},
  ) {
    this.timings = timings
    this.state = {
      index: 0,
      reached: -1,
      phase: 0,
      settled: true,
      playing: false,
      finished: false,
      speed,
      reducedMotion,
      entry: 0,
    }
  }

  getSnapshot = (): PlaybackState => this.state

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** From the first stage; auto-plays unless reduced motion is on. */
  start = (): void => {
    this.clearTimers()
    this.update({ playing: !this.state.reducedMotion, reached: -1, finished: false })
    this.enter(0, false)
  }

  replay = this.start

  play = (): void => {
    if (this.state.index === this.lastIndex) {
      this.replay()
      return
    }
    this.update({ playing: true })
    this.enter(this.state.index + 1, false)
  }

  /** Stops on the current stage, shown in its finished form. */
  pause = (): void => {
    this.clearTimers()
    this.update({
      playing: false,
      settled: true,
      finished: this.state.index === this.lastIndex,
    })
  }

  togglePlay = (): void => (this.state.playing ? this.pause() : this.play())

  /** Animated, and keeps playing if it was. */
  next = (): void => {
    if (this.state.index < this.lastIndex) this.enter(this.state.index + 1, false)
  }

  /** Instant, and pauses: going back is for re-reading, not re-watching. */
  previous = (): void => {
    this.clearTimers()
    this.update({ playing: false })
    this.enter(Math.max(0, this.state.index - 1), true)
  }

  /** Instant, and pauses. Only stages already reached this run. */
  jumpTo = (index: number): void => {
    if (index < 0 || index > this.state.reached) return
    this.clearTimers()
    this.update({ playing: false })
    this.enter(index, true)
  }

  /** Applies to delays scheduled from now on. */
  setSpeed = (speed: PlaybackSpeed): void => this.update({ speed })

  setReducedMotion = (reducedMotion: boolean): void => {
    if (reducedMotion === this.state.reducedMotion) return
    this.update({ reducedMotion })
    if (reducedMotion) this.pause()
  }

  /** Cancels every pending timer; call on unmount. */
  dispose = (): void => this.clearTimers()

  private get lastIndex(): number {
    return this.timings.length - 1
  }

  private enter(index: number, instant: boolean): void {
    this.clearTimers()
    const timing = this.timings[index]
    const isLast = index === this.lastIndex
    const reached = Math.max(this.state.reached, index)
    const { playing } = this.state
    const entry = this.state.entry + 1

    if (instant || this.state.reducedMotion) {
      this.update({
        index,
        reached,
        entry,
        phase: 0,
        settled: true,
        finished: isLast,
        playing: isLast ? false : playing,
      })
      if (!isLast && playing) {
        const hold = timing.holdMs || HOLD_AFTER_NO_CHANGE_MS
        this.later(this.scaled(hold), () => this.enter(index + 1, false))
      }
      return
    }

    this.update({ index, reached, entry, phase: 0, settled: false, finished: false })
    for (const [atMs, phase] of timing.phases) {
      this.later(this.sinceEntry(atMs), () => this.update({ phase }))
    }
    const end = this.sinceEntry(timing.endMs)
    if (isLast) {
      this.later(end, () => this.update({ finished: true, playing: false }))
    } else if (playing) {
      this.later(end + this.scaled(timing.holdMs), () => this.enter(index + 1, false))
    }
  }

  private scaled(ms: number): number {
    return ms / this.state.speed
  }

  /**
   * A moment in a transition plan, counted from entering the stage. The first
   * paint delay is not motion, so it stays fixed: at 2× it would shrink below
   * one frame and the browser could skip painting the starting picture,
   * which makes the transition jump to its end.
   */
  private sinceEntry(ms: number): number {
    return ms <= FIRST_PAINT_MS ? ms : FIRST_PAINT_MS + this.scaled(ms - FIRST_PAINT_MS)
  }

  private later(delayMs: number, run: () => void): void {
    this.timers.push(setTimeout(run, delayMs))
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout)
    this.timers = []
  }

  private update(patch: Partial<PlaybackState>): void {
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
}
