import { ChevronDown } from '@carbon/icons-react'
import { PIPELINE_STAGES } from '../pipeline/stages'
import StageMark from './StageMark'
import type { StageStatus } from './StageMark'
import styles from './StageSummary.module.scss'

export interface StageSummaryInfo {
  /** 1-based place in the pipeline; absent before anything has run. */
  position?: number
  label: string
  status: StageStatus
}

interface StageSummaryProps extends StageSummaryInfo {
  expanded: boolean
  /** id of the stage list this button shows and hides. */
  controls: string
  onToggle: () => void
}

/** The stage list in one line, for narrow screens; tapping it opens the full list. */
function StageSummary({ position, label, status, expanded, controls, onToggle }: StageSummaryProps) {
  return (
    <button
      type="button"
      className={styles.summary}
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
    >
      <span className={styles.mark}>
        <StageMark status={status} />
      </span>
      <span className={styles.where}>
        {position ? `Stage ${position} of ${PIPELINE_STAGES.length}` : `${PIPELINE_STAGES.length} stages`}
        {' · '}
        <span className={styles.label}>{label}</span>
      </span>
      <span className={styles.all}>{expanded ? 'Hide stages' : 'All stages'}</span>
      <ChevronDown size={16} className={styles.chevron} data-expanded={expanded} aria-hidden="true" />
    </button>
  )
}

export default StageSummary
