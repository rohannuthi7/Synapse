import { useId, useState } from 'react'
import type { KeyboardEventHandler, MouseEvent, ReactNode, Ref } from 'react'
import { Column, Grid } from '@carbon/react'
import StageSummary from './StageSummary'
import type { StageSummaryInfo } from './StageSummary'
import styles from './Workspace.module.scss'

interface WorkspaceProps {
  /** The stage list, left of the viewer; behind a one-line summary on narrow screens. */
  stages: ReactNode
  /** Where the run is, for that one-line summary. */
  summary: StageSummaryInfo
  /** The fixed square and whatever sits directly under it. */
  slot: ReactNode
  /** Status, method, metadata and controls; right of the square, or under it when narrow. */
  readout: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  mainRef?: Ref<HTMLElement>
}

/** The page body below the header in every state except the error view. */
function Workspace({ stages, summary, slot, readout, onKeyDown, mainRef }: WorkspaceProps) {
  // Only matters below the md breakpoint; wider screens always show the list.
  const [listOpen, setListOpen] = useState(false)
  const listId = useId()

  // Jumping to a stage from the opened list closes it, so the viewer is in sight.
  const closeOnPick = (event: MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('button')) setListOpen(false)
  }

  return (
    <Grid
      as="main"
      ref={mainRef}
      // Focusable from script only, so keyboard playback works after the
      // button that started the run disappears.
      tabIndex={onKeyDown ? -1 : undefined}
      onKeyDown={onKeyDown}
      className={styles.main}
    >
      <Column sm={4} md={3} lg={3} className={styles.stages}>
        <div className={styles.summary}>
          <StageSummary
            {...summary}
            expanded={listOpen}
            controls={listId}
            onToggle={() => setListOpen((open) => !open)}
          />
        </div>
        <div id={listId} className={styles.list} data-open={listOpen} onClick={closeOnPick}>
          {stages}
        </div>
      </Column>
      <Column as="section" aria-label="Viewer" sm={4} md={5} lg={13} className={styles.viewer}>
        <div className={styles.slot}>{slot}</div>
        <div className={styles.readout}>{readout}</div>
      </Column>
    </Grid>
  )
}

export default Workspace
