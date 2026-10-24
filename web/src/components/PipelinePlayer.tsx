import { useEffect, useMemo, useRef, useState } from 'react'
import { usePlayback } from '../hooks/usePlayback'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { cropGeometry } from '../pipeline/crop'
import {
  cropBoxLabel,
  formatDuration,
  frameSize,
  stageLabel,
  stageMetaRows,
  stageMethod,
  stageStatus,
} from '../pipeline/describe'
import { stageTimings, transitionFor } from '../pipeline/motion'
import { imageAt, stageListItems } from '../pipeline/run'
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

/** Until the hardware link exists, the end of a run says plainly that nothing was sent. */
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
  copyWhat: 'bytes' | 'values'
  copyText: string
  note: string
}

function resultOf(last: Stage): RunResult | null {
  if (last.key === 'frame' && last.bytes) {
    return {
      label: stageLabel('frame'),
      detail: `${frameSize(last.meta)} bytes ready`,
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
      copyWhat: 'values',
      copyText: last.grid.map((row) => row.join(' ')).join('\n'),
      note: 'Next: an encoder packs these values as rtl/packet.sv expects, and the FPGA replies with the predicted digit.',
    }
  }
  return null
}

const readyLineFor = (result: RunResult, announce: boolean) => (
  <StageStatusLine label={result.label} detail={result.detail} status={NOT_SENT} ready announce={announce} />
)

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
  const frameBytes = stage.key === 'frame' ? stage.bytes : undefined
  const result = resultOf(run.stages[run.stages.length - 1])

  const label = stageLabel(stage.key)
  // Numbered within the whole pipeline, so a run that ends early still says "of 11".
  const stageNumber = PIPELINE_STAGES.findIndex((s) => s.key === stage.key) + 1
  const status = finished && result ? `${result.detail}. ${NOT_SENT}` : stageStatus(stage)
  // Values only mean something once they are the final 0-255 inputs.
  const valuesApply = stage.key === 'contrast' || showGrid

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
            showGrid={showGrid}
            finished={finished}
            crop={viewerCrop(run, state.index)}
            transition={transitionFor(stage)}
            phase={state.phase}
            settled={state.settled}
            speed={state.speed}
            caption={`Stage ${stageNumber} of ${PIPELINE_STAGES.length}, ${label}. ${status}`}
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
                frameBytes
                  ? { showGrid, onToggle: () => setSavedView({ ...view, showGrid: !view.showGrid }) }
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
