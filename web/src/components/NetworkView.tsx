import { useState } from 'react'
import type { CSSProperties } from 'react'
import { barGeometry, formatScore, products, WEIGHT_LIMIT, zeroAxis } from '../pipeline/network'
import type { StageMetaByKey } from '../pipeline/types'
import PixelGrid from './PixelGrid'
import WeightMap from './WeightMap'
import styles from './NetworkView.module.scss'

interface NetworkViewProps {
  /** The 8 × 8 brightness bytes the board received, rows first. */
  grid: number[][]
  meta: StageMetaByKey['result']
  /** 1 input and weights in, 2 score bars grow, 3 the winner lights up. */
  phase: number
  /** Shown in its final form with no motion. */
  settled: boolean
}

/**
 * The single-layer network on the Result stage: the input on the left; on the
 * right, each digit's weights and the signed sum they give. Pointing at a
 * digit swaps its weights for input × weight, the 64 terms of its score.
 */
function NetworkView({ grid, meta, phase, settled }: NetworkViewProps) {
  const [active, setActive] = useState<number | null>(null)
  const { scores, digit, tie, weights } = meta
  const bars = barGeometry(scores)
  const axis = zeroAxis(scores)
  const shown = settled ? 3 : phase
  const terms = active === null ? null : products(grid, weights[active]).flat()
  const termLimit = terms ? Math.max(1, ...terms.map(Math.abs)) : 1

  return (
    <div className={styles.view} data-phase={shown} data-instant={settled} aria-hidden="true">
      <div className={styles.input}>
        <span className={styles.heading}>Input · 64 bytes over UART</span>
        <div className={styles.inputGrid}>
          <PixelGrid values={grid} filled lines="faint" showValues={false} instant />
        </div>
        <div className={styles.prediction}>
          <span className={styles.heading}>Predicted</span>
          <span className={styles.digit}>{digit}</span>
          {tie && <span className={styles.tie}>tie</span>}
        </div>
        <span className={styles.sum}>
          {active === null
            ? 'Hover a digit for x · w'
            : `${active}: Σ x·w = ${formatScore(scores[active])}`}
        </span>
      </div>
      <div className={styles.rows} onMouseLeave={() => setActive(null)}>
        <span className={styles.heading}>Weights · 10 × 64</span>
        <span className={styles.heading} data-align="end">
          Score
        </span>
        {scores.map((score, d) => (
          <div
            key={d}
            className={styles.row}
            data-winner={d === digit}
            data-active={d === active}
            style={{ '--i': d } as CSSProperties}
            onMouseEnter={() => setActive(d)}
            onClick={() => setActive(d === active ? null : d)}
          >
            <span className={styles.label}>{d}</span>
            <span className={styles.map}>
              {terms && d === active ? (
                <WeightMap values={terms} limit={termLimit} />
              ) : (
                <WeightMap values={weights[d]} limit={WEIGHT_LIMIT} />
              )}
            </span>
            <span className={styles.track}>
              {axis > 0 && <span className={styles.axis} style={{ left: `${axis}%` }} />}
              <span
                className={styles.bar}
                data-negative={bars[d].negative}
                style={{ left: `${bars[d].start}%`, width: `${bars[d].width}%` }}
              />
            </span>
            <span className={styles.score}>{formatScore(score)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default NetworkView
