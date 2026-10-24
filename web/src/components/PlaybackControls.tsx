import { PauseFilled, PlayFilledAlt, Reset, SkipBackFilled, SkipForwardFilled } from '@carbon/icons-react'
import { PLAYBACK_SPEEDS } from '../playback/PlaybackController'
import type { PlaybackSpeed } from '../playback/PlaybackController'
import styles from './PlaybackControls.module.scss'

interface PlaybackControlsProps {
  playing: boolean
  speed: PlaybackSpeed
  /** One line under the controls saying how playback relates to real time. */
  footnote: string
  onPrevious: () => void
  onTogglePlay: () => void
  onNext: () => void
  onReplay: () => void
  onSpeedChange: (speed: PlaybackSpeed) => void
}

const speedLabel = (speed: PlaybackSpeed) => `${speed}×`

function PlaybackControls({
  playing,
  speed,
  footnote,
  onPrevious,
  onTogglePlay,
  onNext,
  onReplay,
  onSpeedChange,
}: PlaybackControlsProps) {
  const playLabel = playing ? 'Pause' : 'Play'
  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <div role="group" aria-label="Playback" className={styles.buttons}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Previous stage"
            title="Previous stage (left arrow)"
            onClick={onPrevious}
          >
            <SkipBackFilled size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={playLabel}
            title={`${playLabel} (space)`}
            onClick={onTogglePlay}
          >
            {playing ? (
              <PauseFilled size={20} aria-hidden="true" />
            ) : (
              <PlayFilledAlt size={20} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Next stage"
            title="Next stage (right arrow)"
            onClick={onNext}
          >
            <SkipForwardFilled size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Replay"
            title="Replay (R)"
            onClick={onReplay}
          >
            <Reset size={20} aria-hidden="true" />
          </button>
        </div>
        <div role="group" aria-label="Playback speed" className={styles.speed}>
          <span className={styles.speedLabel} aria-hidden="true">
            Speed
          </span>
          <div className={styles.segments}>
            {PLAYBACK_SPEEDS.map((option) => (
              <button
                key={option}
                type="button"
                className={styles.segment}
                aria-pressed={option === speed}
                onClick={() => onSpeedChange(option)}
              >
                {speedLabel(option)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <p className={styles.footnote}>{footnote}</p>
    </div>
  )
}

export default PlaybackControls
