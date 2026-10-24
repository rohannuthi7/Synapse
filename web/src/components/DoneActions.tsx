import { Button } from '@carbon/react'
import { Copy, Grid, Reset, Upload } from '@carbon/icons-react'
import styles from './DoneActions.module.scss'

export type CopyState = 'idle' | 'copied' | 'failed'

interface DoneActionsProps {
  /**
   * Present when the square has a second view to flip to: the grid behind the
   * frame's bytes, or the reply bytes behind the network. `labels` are the
   * button's text while off and while on.
   */
  gridToggle?: { showGrid: boolean; onToggle: () => void; labels?: readonly [off: string, on: string] }
  /** What Copy puts on the clipboard, as the button names it. */
  copyWhat: 'bytes' | 'values' | 'scores'
  copyState: CopyState
  /** One line on what the result is for, and what happens to it next. */
  note: string
  onCopy: () => void
  onReplay: () => void
  onUploadAnother: () => void
}

/** What can be done with a finished run; replaces the playback controls. */
function DoneActions({
  gridToggle,
  copyWhat,
  copyState,
  note,
  onCopy,
  onReplay,
  onUploadAnother,
}: DoneActionsProps) {
  const copyLabel =
    copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : `Copy ${copyWhat}`
  return (
    <div className={styles.actions}>
      <div className={styles.row}>
        {gridToggle && (
          <Button
            kind="ghost"
            size="lg"
            renderIcon={Grid}
            className={styles.labelled}
            aria-pressed={gridToggle.showGrid}
            onClick={gridToggle.onToggle}
          >
            {(gridToggle.labels ?? ['Show grid', 'Show bytes'])[gridToggle.showGrid ? 1 : 0]}
          </Button>
        )}
        <Button kind="ghost" size="lg" renderIcon={Copy} className={styles.labelled} onClick={onCopy}>
          {copyLabel}
        </Button>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Replay"
          title="Replay (R)"
          onClick={onReplay}
        >
          <Reset size={20} aria-hidden="true" />
        </button>
        <Button kind="primary" size="lg" renderIcon={Upload} onClick={onUploadAnother}>
          Upload another
        </Button>
      </div>
      <p className={styles.note}>{note}</p>
    </div>
  )
}

export default DoneActions
