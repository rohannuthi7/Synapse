import type { MetaRow } from '../pipeline/describe'
import styles from './StageMetadata.module.scss'

interface StageMetadataProps {
  rows: readonly MetaRow[]
}

/** The facts the backend measured for this stage, two to a row. */
function StageMetadata({ rows }: StageMetadataProps) {
  return (
    <dl className={styles.list}>
      {rows.map(({ label, value }) => (
        <div key={label}>
          <dt className={styles.label}>{label}</dt>
          <dd className={styles.value}>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default StageMetadata
