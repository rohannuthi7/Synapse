import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayback } from '../hooks/usePlayback'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { cropGeometry } from '../pipeline/crop'
import {
  boardName,
  cropBoxLabel,
  formatDuration,
  formatWireMs,
  frameSize,
  stageLabel,
  stageMetaRows,
  stageMethod,
  stageStatus,
} from '../pipeline/describe'
import { stageTimings, transitionFor } from '../pipeline/motion'
import { formatScore } from '../pipeline/network'
import { imageAt, runTiming, stageListItems } from '../pipeline/run'
import { PIPELINE_STAGES } from '../pipeline/stages'
import type { StageKey } from '../pipeline/stages'
import type { PipelineRun, Stage } from '../pipeline/types'
import type { PlaybackState } from '../playback/PlaybackController'
import DoneActions from './DoneActions'
import type { CopyState } from './DoneActions'
import MethodPanel from './MethodPanel'
import PlaybackControls from './PlaybackControls'
import StableHeight from './StableHeight'
import StageList from './StageList'
import StageMetadata from './StageMetadata'
import StageStatusLine from './StageStatusLine'
import StageViewer from './StageViewer'
import type { ViewerCrop } from './StageViewer'
import ValuesToggle from './ValuesToggle'
import Workspace from './Workspace'
import styles from './PipelinePlayer.module.scss'

interface PipelinePlayerProps {
  run: PipelineRun
  /** Back to the empty page to pick another image. */
  onUploadAnother: () => void
}

/** A run that ends before the board answers says plainly that nothing was sent. */
const NOT_SENT = 'Hardware not connected. Frame not sent.'

function footnoteFor({ reducedMotion, playing }: PlaybackState): string {
  if (reducedMotion) {
    return 'Reduced motion is on: stages swap instantly. Step with the arrow keys or the buttons.'
  }
  return playing
    ? 'Playback slowed for viewing. Times shown are real.'
    : 'Paused. Left and right arrows step, space plays, R replays.'
}

/** The crop, once playback has reached it; every later stage stays zoomed in. */
function viewerCrop(run: PipelineRun, index: number): ViewerCrop | undefined {
  const cropIndex = run.stages.findIndex((s) => s.key === 'crop')
  const stage = run.stages[cropIndex]
  if (cropIndex < 0 || index < cropIndex || stage.key !== 'crop') return undefined
  return { geometry: cropGeometry(stage.meta), label: cropBoxLabel(stage.meta) }
}

const toHex = (bytes: readonly number[]) =>
  bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')

const statusLineFor = (stage: Stage, announce: boolean) => (
  <StageStatusLine
    label={stageLabel(stage.key)}
    detail={formatDuration(stage.duration_ms)}
    status={stageStatus(stage)}
    announce={announce}
  />
)

/** What a finished run produced, from its last stage. */
interface RunResult {
  label: string
  detail: string
  /** The sentence under the title: where the answer came from, or that nothing was sent. */
  status: string
  copyWhat: 'bytes' | 'values' | 'scores'
  copyText: string
  note: string
}

function resultOf(run: PipelineRun): RunResult | null {
  const last = run.stages[run.stages.length - 1]
  if (last.key === 'result') {
    const { meta } = last
    const timing = runTiming(run)
    const where =
      meta.source === 'fpga' ? 'Scored on the FPGA.' : 'No board connected: scored by the emulator.'
    return {
      label: `Predicted ${meta.digit}`,
      detail: `${boardName(meta)} · ${formatDuration(last.duration_ms)}`,
      status: `${where} Total ${formatDuration(timing.total)}.`,
      copyWhat: 'scores',
      copyText: [
        ...meta.scores.map((score, d) => `${d}\t${score}`),
        `predicted\t${meta.digit}${meta.tie ? ' (tie)' : ''}`,
        `reply\t${toHex(last.bytes ?? [])}`,
      ].join('\n'),
      note:
        `Preprocessing ${formatDuration(timing.preprocessing)} · frame ${formatDuration(timing.frame)} · ` +
        `board ${formatDuration(timing.board)}, of which ${formatWireMs(meta.wire_ms)} is bytes on the wire` +
        `${meta.weights_sent ? ', weights reloaded' : ''}. Weights: ${meta.weights_source}.`,
    }
  }
  if (last.key === 'frame' && last.bytes) {
    return {
      label: stageLabel('frame'),
      detail: `${frameSize(last.meta)} bytes ready`,
      status: NOT_SENT,
      copyWhat: 'bytes',
      copyText: toHex(last.bytes),
      note: 'Layout follows rtl/packet.sv. Next: the FPGA scores it and replies with the predicted digit.',
    }
  }
  if (last.grid) {
    // No frame encoder yet, so the run's output is the 8 × 8 grid itself.
    return {
      label: '8×8 grid',
      detail: `${last.grid.flat().length} values ready`,
      status: NOT_SENT,
      copyWhat: 'values',
      copyText: last.grid.map((row) => row.join(' ')).join('\n'),
      note: 'Next: an encoder packs these values as rtl/packet.sv expects, and the FPGA replies with the predicted digit.',
    }
  }
  return null
}

const readyLineFor = (result: RunResult, announce: boolean) => (
  <StageStatusLine label={result.label} detail={result.detail} status={result.status} ready announce={announce} />
)

/** The Result stage's network: the bytes the board received, and its answer. */
function networkFor(run: PipelineRun, stage: Stage) {
  const input = run.stages.find((s) => s.key === 'frame')?.grid ?? run.stages.find((s) => s.key === 'contrast')?.grid
  if (stage.key !== 'result' || !input) return undefined
  return { grid: input, meta: stage.meta }
}

/** For screen readers, what the network picture shows. */
const scoresCaption = (stage: Stage) =>
  stage.key === 'result'
    ? ` Scores: ${stage.meta.scores.map((score, d) => `${d} ${formatScore(score)}`).join(', ')}.`
    : ''

const methodPanelFor = (stage: Stage) => (
  <MethodPanel fn={stage.function} how={stageMethod(stage.key)} />
)

const metadataFor = (stage: Stage) => <StageMetadata rows={stageMetaRows(stage)} />

/** View choices on the finished frame; they last for one visit to the stage. */
interface FrameView {
  entry: number
  showGrid: boolean
  copy: CopyState
}

/** Plays one run back stage by stage. Key it by run id so each run starts fresh. */
function PipelinePlayer({ run, onUploadAnother }: PipelinePlayerProps) {
  const reducedMotion = usePrefersReducedMotion()
  const timings = useMemo(() => stageTimings(run.stages), [run.stages])
  const playback = usePlayback(timings, reducedMotion)
  const { state } = playback
  const mainRef = useRef<HTMLElement>(null)
  const [showValues, setShowValues] = useState(true)
  const [savedView, setSavedView] = useState<FrameView | null>(null)

  // The control that started the run is gone, so give the keys somewhere to land.
  useEffect(() => mainRef.current?.focus({ preventScroll: true }), [])

  const stage = run.stages[state.index]
  const finished = state.finished

  // Finishing swaps the controls for the done actions, and replaying swaps
  // them back. A focused button that vanishes drops focus to <body>, outside
  // the region the keys are bound to; catch it and keep the keys working.
  useEffect(() => {
    const active = document.activeElement
    if (!active || active === document.body) mainRef.current?.focus({ preventScroll: true })
  }, [finished])
  // A saved view only applies to the visit it was made on: leaving the stage
  // or replaying starts a new entry, which drops it.
  const view: FrameView =
    savedView?.entry === state.entry ? savedView : { entry: state.entry, showGrid: false, copy: 'idle' }
  const showGrid = finished && view.showGrid
  // The Frame stage shows its bytes unless flipped to the grid; the Result
  // stage shows the network unless flipped to the reply bytes.
  const frameBytes =
    stage.key === 'frame' ? stage.bytes : stage.key === 'result' && showGrid ? stage.bytes : undefined
  const result = resultOf(run)

  const label = stageLabel(stage.key)
  // Numbered within the whole pipeline, so a run that ends early still says "of 12".
  const stageNumber = PIPELINE_STAGES.findIndex((s) => s.key === stage.key) + 1
  const status = finished && result ? `${result.detail}. ${result.status}` : stageStatus(stage)
  // Values only mean something once they are the final 0-255 inputs.
  const valuesApply = stage.key === 'contrast' || (stage.key === 'frame' && showGrid)
  const toggleLabels =
    stage.key === 'result' ? (['Show reply bytes', 'Show network'] as const) : undefined

  const jumpTo = (key: StageKey) => playback.jumpTo(run.stages.findIndex((s) => s.key === key))

  const copyResult = async () => {
    if (!result) return
    let copy: CopyState = 'copied'
    try {
      await navigator.clipboard.writeText(result.copyText)
    } catch {
      copy = 'failed'
    }
    setSavedView({ ...view, copy })
  }

  const statusVariants = [
    ...run.stages.map((s) => statusLineFor(s, false)),
    ...(result ? [readyLineFor(result, false)] : []),
  ]

  return (
    <Workspace
      mainRef={mainRef}
      onKeyDown={playback.onKeyDown}
      stages={<StageList items={stageListItems(run, state)} onSelect={jumpTo} />}
      summary={{ position: stageNumber, label, status: finished ? 'complete' : 'current' }}
      slot={
        <div className={styles.slot}>
          <StageViewer
            image={imageAt(run, state.index)}
            previousImage={imageAt(run, state.index - 1)}
            grid={stage.grid}
            previousGrid={run.stages[state.index - 1]?.grid}
            showValues={showValues && valuesApply}
            frameBytes={frameBytes}
            showGrid={stage.key === 'frame' && showGrid}
            bytesHeadLabel={stage.key === 'result' ? 'sync · RESULT · length' : undefined}
            network={networkFor(run, stage)}
            finished={finished}
            crop={viewerCrop(run, state.index)}
            transition={transitionFor(stage)}
            phase={state.phase}
            settled={state.settled}
            speed={state.speed}
            caption={`Stage ${stageNumber} of ${PIPELINE_STAGES.length}, ${label}. ${status}${scoresCaption(stage)}`}
          />
          <ValuesToggle checked={showValues} onChange={setShowValues} hidden={!valuesApply} />
        </div>
      }
      readout={
        <>
          {/* Each block keeps the height of its tallest stage, so the controls never move. */}
          <StableHeight variants={statusVariants}>
            {finished && result ? readyLineFor(result, true) : statusLineFor(stage, true)}
          </StableHeight>
          <StableHeight variants={run.stages.map(methodPanelFor)}>{methodPanelFor(stage)}</StableHeight>
          <StableHeight variants={run.stages.map(metadataFor)}>{metadataFor(stage)}</StableHeight>
          {finished && result ? (
            <DoneActions
              gridToggle={
                stage.bytes && (stage.key === 'frame' || stage.key === 'result')
                  ? {
                      showGrid,
                      onToggle: () => setSavedView({ ...view, showGrid: !view.showGrid }),
                      labels: toggleLabels,
                    }
                  : undefined
              }
              copyWhat={result.copyWhat}
              copyState={view.copy}
              note={result.note}
              onCopy={() => void copyResult()}
              onReplay={playback.replay}
              onUploadAnother={onUploadAnother}
            />
          ) : (
            <PlaybackControls
              playing={state.playing}
              speed={state.speed}
              footnote={footnoteFor(state)}
              onPrevious={playback.previous}
              onTogglePlay={playback.togglePlay}
              onNext={playback.next}
              onReplay={playback.replay}
              onSpeedChange={playback.setSpeed}
            />
          )}
        </>
      }
    />
  )
}

export default PipelinePlayer
