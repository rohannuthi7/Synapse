import type { StageKey } from '../pipeline/stages'
import StageMark from './StageMark'
import type { StageStatus } from './StageMark'
import styles from './StageList.module.scss'

export interface StageListItem {
  key: StageKey
  label: string
  status: StageStatus
  /** Real backend time plus a short note, e.g. "9 ms · rotated 90°". */
  detail?: string
  /** Only stages the run has already reached can be jumped to. */
  selectable: boolean
  /** A stage the backend does not run yet; labelled so instead of looking unreached. */
  planned?: boolean
}

interface StageListProps {
  items: readonly StageListItem[]
  onSelect?: (key: StageKey) => void
}

const STATUS_TEXT: Record<StageStatus, string> = {
  complete: 'Complete',
  current: 'Current',
  incomplete: 'Not started',
}

/** Vertical progress through the pipeline; finished stages are buttons that jump back. */
function StageList({ items, onSelect }: StageListProps) {
  return (
    <nav aria-label="Pipeline stages">
      <h2 className={styles.heading}>Stages</h2>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <li key={item.key} className={styles.stage}>
              <div className={styles.track}>
                <StageMark status={item.status} />
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={styles.line}
                    data-complete={item.status === 'complete'}
                  />
                )}
              </div>
              <button
                type="button"
                className={styles.button}
                disabled={!item.selectable}
                aria-current={item.status === 'current' ? 'step' : undefined}
                onClick={() => onSelect?.(item.key)}
              >
                <span className={styles.name} data-current={item.status === 'current'}>
                  {item.label}
                </span>
                <span className={styles.visuallyHidden}>
                  {item.planned ? 'Planned, not built yet' : STATUS_TEXT[item.status]}
                </span>
                {item.planned ? (
                  <span className={styles.detail}>Planned</span>
                ) : (
                  item.detail && <span className={styles.detail}>{item.detail}</span>
                )}
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default StageList
