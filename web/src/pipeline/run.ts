import type { StageListItem } from '../components/StageList'
import type { PlaybackState } from '../playback/PlaybackController'
import { stageDetail } from './describe'
import { PIPELINE_STAGES } from './stages'
import type { PipelineRun } from './types'

/**
 * The picture to show at a stage: its own image, or the latest earlier one
 * (stages that changed nothing send none), or the local preview of the
 * upload before the backend's first image.
 */
export function imageAt(run: PipelineRun, index: number): string {
  for (let k = Math.min(index, run.stages.length - 1); k >= 0; k--) {
    const image = run.stages[k].image
    if (image) return image
  }
  return run.preview
}

/** Stage list rows for where playback is: done, current, or not yet shown. */
export function stageListItems(
  run: PipelineRun,
  { index, reached, finished }: Pick<PlaybackState, 'index' | 'reached' | 'finished'>,
): StageListItem[] {
  // Matched by key, not position: playback indexes the run's own stage list.
  return PIPELINE_STAGES.map(({ key, label }) => {
    const at = run.stages.findIndex((s) => s.key === key)
    const stage = run.stages[at]
    const isCurrent = at === index && !finished
    const wasReached = stage !== undefined && at <= reached
    return {
      key,
      label,
      status: isCurrent ? 'current' : wasReached ? 'complete' : 'incomplete',
      detail: wasReached ? stageDetail(stage) : undefined,
      selectable: wasReached,
      // A finished run that has no such stage: the backend doesn't run it yet.
      planned: stage === undefined,
    }
  })
}

/** Where the run's real time went, from the backend's per-stage measurements. */
export interface RunTiming {
  total: number
  /** Received through Contrast: everything before the frame exists. */
  preprocessing: number
  frame: number
  /** First byte out to last byte back, including any weight reload. */
  board: number
}

export function runTiming(run: PipelineRun): RunTiming {
  const ms = (key: string) => run.stages.find((s) => s.key === key)?.duration_ms ?? 0
  const total = run.stages.reduce((sum, s) => sum + s.duration_ms, 0)
  const frame = ms('frame')
  const board = ms('result')
  return { total, preprocessing: total - frame - board, frame, board }
}
