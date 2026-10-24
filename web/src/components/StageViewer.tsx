import type { CSSProperties } from 'react'
import { fillTransform } from '../pipeline/crop'
import type { CropGeometry, SlotRect } from '../pipeline/crop'
import type { TransitionKind } from '../pipeline/motion'
import type { PlaybackSpeed } from '../playback/PlaybackController'
import FrameBytes from './FrameBytes'
import PixelGrid from './PixelGrid'
import type { GridLines } from './PixelGrid'
import styles from './StageViewer.module.scss'

export interface ViewerCrop {
  geometry: CropGeometry
  /** Shown above the box while it is drawn, e.g. "ink box · 1536 × 2392". */
  label: string
}

interface StageViewerProps {
  /** Output of the stage on screen. */
  image: string
  /** Output of the stage before it; what a wipe uncovers from. */
  previousImage: string
  /** 8 × 8 values once the pipeline has downsampled. */
  grid?: number[][]
  /** The stage before's values; Contrast shifts the cells from these. */
  previousGrid?: number[][]
  /** Print the 0-255 value in each cell. */
  showValues?: boolean
  /** The packet's bytes on the Frame stage, shown as a hex dump unless `showGrid`. */
  frameBytes?: readonly number[]
  /** On the Frame stage, show the 8 × 8 cells instead of the bytes. */
  showGrid?: boolean
  /** The run is over; the frame's row labels appear. */
  finished?: boolean
  /** Present from the crop stage on; later stages stay zoomed to it. */
  crop?: ViewerCrop
  transition: TransitionKind
  phase: number
  /** True when the stage is shown in its final form with no motion. */
  settled: boolean
  speed: PlaybackSpeed
  /** Updated every stage, so screen readers get what the picture shows. */
  caption: string
}

const rectStyle = ({ x, y, width, height }: SlotRect): CSSProperties => ({
  left: `${x * 100}%`,
  top: `${y * 100}%`,
  width: `${width * 100}%`,
  height: `${height * 100}%`,
})

// Everything outside the box, as one even-odd path in a 0-100 viewBox.
const dimPath = ({ x, y, width, height }: SlotRect) => {
  const [l, t, r, b] = [x, y, x + width, y + height].map((n) => +(n * 100).toFixed(3))
  return `M0 0H100V100H0Z M${l} ${t}H${r}V${b}H${l}Z`
}

/**
 * The fixed square every stage plays in. The scan line passes over Decoded;
 * changed images are revealed top to bottom under it. On Crop, a box draws
 * around the ink, the outside dims, then the box's square zooms to fill.
 */
function StageViewer({
  image,
  previousImage,
  grid,
  previousGrid,
  showValues = false,
  frameBytes,
  showGrid = false,
  finished = false,
  crop,
  transition,
  phase,
  settled,
  speed,
  caption,
}: StageViewerProps) {
  const moving = !settled
  const wiping = moving && transition === 'wipe'
  const scanning = moving && (transition === 'wipe' || transition === 'line')
  // Phase 1 starts the sweep; phase 0 is the frame painted before it.
  const swept = phase >= 1

  // Crop phases: 1 box draws in, 2 outside dims, 3 zoom (box and dim fade out).
  const cropping = moving && transition === 'crop'
  const boxShown = cropping && phase >= 1 && phase < 3
  const dimShown = cropping && phase === 2
  const zoomed = crop !== undefined && (!cropping || phase >= 3)
  const zoom = cropping ? (phase >= 3 ? 'zooming' : 'off') : zoomed ? 'done' : 'off'

  // Downsample: 1 grid lines appear over the cropped image, 2 cells fill row
  // by row. Contrast: 1 the same cells shift to their stretched shades.
  const downsampling = transition === 'downsample'
  const lines: GridLines = downsampling ? (settled || phase >= 1 ? 'full' : 'hidden') : 'faint'
  const filled = !downsampling || settled || phase >= 2
  const beforeStretch = moving && transition === 'contrast' && phase < 1
  const cells = beforeStretch && previousGrid ? previousGrid : grid

  return (
    <figure
      className={styles.viewer}
      data-settled={settled}
      style={{ '--playback-speed': speed } as CSSProperties}
    >
      <div
        className={styles.cropLayer}
        data-zoom={zoom}
        style={{ transform: zoomed && crop ? fillTransform(crop.geometry.region) : 'none' }}
      >
        <img className={styles.image} src={wiping ? previousImage : image} alt="" />
        <img
          className={styles.image}
          src={image}
          alt=""
          data-wipe={wiping ? (swept ? 'revealing' : 'hidden') : 'none'}
        />
        {crop && (
          <>
            <svg
              className={styles.dim}
              data-shown={dimShown}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path d={dimPath(crop.geometry.box)} fillRule="evenodd" />
            </svg>
            <div
              className={styles.box}
              data-shown={boxShown}
              style={rectStyle(crop.geometry.box)}
              aria-hidden="true"
            >
              <span className={styles.boxLabel}>{crop.label}</span>
            </div>
          </>
        )}
      </div>
      {cells && (
        <PixelGrid
          values={cells}
          filled={filled}
          lines={lines}
          showValues={showValues}
          instant={settled}
        />
      )}
      {frameBytes && !showGrid && (
        <FrameBytes
          bytes={frameBytes}
          shown={settled || phase >= 1}
          labelled={finished}
          instant={settled}
        />
      )}
      <div
        aria-hidden="true"
        className={styles.scanLine}
        data-scan={scanning ? (swept ? 'sweeping' : 'ready') : 'off'}
      />
      <figcaption className={styles.caption}>{caption}</figcaption>
    </figure>
  )
}

export default StageViewer
