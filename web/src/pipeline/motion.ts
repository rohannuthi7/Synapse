import type { Stage } from './types'

/** How the viewer moves into a stage. `none` is an instant swap. */
export type TransitionKind = 'none' | 'line' | 'wipe' | 'crop' | 'downsample' | 'contrast' | 'frame'

/**
 * Lets the browser paint a stage's starting picture before anything moves.
 * Every plan's first phase starts here; it is not scaled by playback speed.
 */
export const FIRST_PAINT_MS = 30

/**
 * When each visual phase of a transition starts, and when it is over, in ms
 * at 1× speed. Phases are numbered from 1; phase 0 is the starting picture.
 */
export interface TransitionPlan {
  phases: readonly (readonly [atMs: number, phase: number])[]
  endMs: number
}

// From the Playback prototype. Each end is the last phase's start plus its
// Carbon duration: slow-01 400ms for scan and wipe, moderate-02 240ms for the
// crop box and grid lines, slow-02 700ms for the dim, and per-cell or per-byte
// staggers for the grid and frame.
export const TRANSITION_PLANS: Record<TransitionKind, TransitionPlan> = {
  none: { phases: [], endMs: 0 },
  line: { phases: [[30, 1]], endMs: 430 },
  wipe: { phases: [[30, 1]], endMs: 430 },
  crop: { phases: [[30, 1], [270, 2], [970, 3]], endMs: 1370 },
  downsample: { phases: [[30, 1], [270, 2]], endMs: 590 },
  contrast: { phases: [[30, 1]], endMs: 350 },
  frame: { phases: [[30, 1]], endMs: 840 },
}

/** Time to read a finished stage before auto-advancing. */
export const HOLD_AFTER_ANIMATION_MS = 900
export const HOLD_AFTER_NO_CHANGE_MS = 300
/** The first stage holds longer so the run's start registers. */
export const HOLD_FIRST_STAGE_MS = 600

/** Only stages that really changed the image move; the rest swap instantly. */
export function transitionFor(stage: Stage): TransitionKind {
  switch (stage.key) {
    case 'received':
    case 'validated':
      return 'none'
    case 'decoded':
      return 'line'
    case 'orientation':
    case 'transparency':
    case 'grayscale':
    case 'polarity':
      return stage.changed ? 'wipe' : 'none'
    case 'crop':
      return 'crop'
    case 'downsample':
      return 'downsample'
    case 'contrast':
      return 'contrast'
    case 'frame':
      return 'frame'
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}

export interface StageTiming extends TransitionPlan {
  holdMs: number
}

/** Frame bytes fade in one after another, in the order they would be sent. */
export const BYTE_STAGGER_MS = 10
/** Carbon $duration-fast-02, each byte's fade. */
export const BYTE_FADE_MS = 110

/** The frame's plan depends on how many bytes it has; every other plan is fixed. */
function planFor(stage: Stage): TransitionPlan {
  const plan = TRANSITION_PLANS[transitionFor(stage)]
  if (stage.key !== 'frame' || !stage.bytes) return plan
  return { ...plan, endMs: FIRST_PAINT_MS + stage.bytes.length * BYTE_STAGGER_MS + BYTE_FADE_MS }
}

export function stageTimings(stages: readonly Stage[]): StageTiming[] {
  return stages.map((stage, index) => {
    const plan = planFor(stage)
    const isLast = index === stages.length - 1
    const holdMs = isLast
      ? 0
      : index === 0
        ? HOLD_FIRST_STAGE_MS
        : plan.endMs > 0
          ? HOLD_AFTER_ANIMATION_MS
          : HOLD_AFTER_NO_CHANGE_MS
    return { ...plan, holdMs }
  })
}
