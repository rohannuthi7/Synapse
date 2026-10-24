import { signedColor } from '../pipeline/network'
import styles from './WeightMap.module.scss'

interface WeightMapProps {
  /** 64 signed values, rows first: one digit's weights, or input × weight. */
  values: readonly number[]
  /** The magnitude drawn at full strength. */
  limit: number
}

/** An 8 × 8 heatmap: blue cells raise the digit's score, red cells lower it. */
function WeightMap({ values, limit }: WeightMapProps) {
  return (
    <span className={styles.map}>
      {values.map((value, i) => (
        <span key={i} className={styles.cell} style={{ backgroundColor: signedColor(value, limit) }} />
      ))}
    </span>
  )
}

export default WeightMap
