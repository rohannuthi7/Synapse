import type { CSSProperties } from 'react'
import { cellInk } from '../pipeline/cellText'
import styles from './PixelGrid.module.scss'

export type GridLines = 'hidden' | 'full' | 'faint'

interface PixelGridProps {
  /** 8 × 8 values, 0-255, rows first. */
  values: number[][]
  /** Cells fade in row by row when this turns true. */
  filled: boolean
  lines: GridLines
  /** Print each cell's value inside it. */
  showValues: boolean
  /** Jump straight to the end state, as after a pause or a jump. */
  instant: boolean
}

// The seven inner lines each way of an 8 × 8 grid, in a 0-8 viewBox.
const LINES = Array.from({ length: 7 }, (_, i) => `M${i + 1} 0V8M0 ${i + 1}H8`).join('')

/**
 * The 64 cells every stage from Downsample on is drawn with. Row index is
 * handed to CSS so fills and shade changes stagger 30ms per row.
 */
function PixelGrid({ values, filled, lines, showValues, instant }: PixelGridProps) {
  return (
    <div className={styles.grid} data-filled={filled} data-instant={instant} aria-hidden="true">
      {values.map((row, r) =>
        row.map((value, c) => (
          <span
            key={`${r}-${c}`}
            className={styles.cell}
            data-ink={cellInk(value)}
            style={{ backgroundColor: `rgb(${value} ${value} ${value})`, '--row': r } as CSSProperties}
          >
            {showValues && value}
          </span>
        )),
      )}
      <svg className={styles.lines} data-lines={lines} viewBox="0 0 8 8" preserveAspectRatio="none">
        <path d={LINES} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  )
}

export default PixelGrid
