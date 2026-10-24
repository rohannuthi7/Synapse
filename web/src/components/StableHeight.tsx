import type { ReactNode } from 'react'
import styles from './StableHeight.module.scss'

interface StableHeightProps {
  /** Every version this block can show, e.g. one per stage. Never visible. */
  variants: readonly ReactNode[]
  /** The version on screen now. */
  children: ReactNode
}

/**
 * Keeps a block as tall as its tallest version, so what sits below it (the
 * playback controls) stays still while the content changes stage to stage.
 * All versions share one grid cell; the hidden ones only lend their height,
 * which tracks the real wrapping at any width with no measuring in script.
 */
function StableHeight({ variants, children }: StableHeightProps) {
  return (
    <div className={styles.stack}>
      {variants.map((variant, i) => (
        <div key={i} className={styles.sizer} data-sizer="" aria-hidden="true" inert>
          {variant}
        </div>
      ))}
      <div className={styles.current}>{children}</div>
    </div>
  )
}

export default StableHeight
