import { CheckmarkFilled } from '@carbon/icons-react'
import styles from './StageStatusLine.module.scss'

interface StageStatusLineProps {
  label: string
  /** Set in mono after the label: a real time ("4 ms") or a count ("68 bytes ready"). */
  detail: string
  status: string
  /** The run's end: marked with the success check. */
  ready?: boolean
  /** The one visible copy is a polite live region; height-reserving copies are not. */
  announce?: boolean
}

/** "Grayscale · 4 ms" and one plain sentence, announced politely on each stage change. */
function StageStatusLine({ label, detail, status, ready = false, announce = true }: StageStatusLineProps) {
  return (
    <div {...(announce && { role: 'status', 'aria-live': 'polite' as const })}>
      <p className={styles.title}>
        {ready && <CheckmarkFilled size={16} className={styles.ready} aria-hidden="true" />}
        <span>
          {label} · <span className={styles.detail}>{detail}</span>
        </span>
      </p>
      <p className={styles.status}>{status}</p>
    </div>
  )
}

export default StageStatusLine
