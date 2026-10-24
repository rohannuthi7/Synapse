import type { StageKey } from './stages'

// The per-stage contract the backend will return (see docs/api.md once wired
// in step 8). Field names are snake_case to match the rest of the API.

/** The Python function that produced a stage, e.g. preprocess.py › to_grayscale(img). */
export interface FunctionRef {
  file: string
  name: string
  params: string[]
  /** True while the function exists only in the plan, not in the code. */
  planned?: boolean
  /** Functions it calls that are worth naming, e.g. where a cutoff comes from. */
  helpers?: FunctionRef[]
}

/** Image dimensions as shown: width × height, then channels if any. */
export type Shape = number[]

/** Pixels, measured in the image the stage received. */
export interface PixelBox {
  top: number
  left: number
  width: number
  height: number
}

export interface ValueRange {
  min: number
  max: number
}

/** What each stage measured, keyed by stage. Only facts the backend computed. */
export interface StageMetaByKey {
  received: { filename: string | null; declared_mime: string | null; bytes: number }
  validated: { signature: number[]; detected_mime: string; bytes: number; limit_bytes: number }
  decoded: { format: string; shape: Shape; dtype: string; max_pixels: number }
  orientation: { exif_orientation: number | null; rotation_degrees: number; shape: Shape }
  transparency: { mode: string; has_alpha: boolean }
  grayscale: { shape: Shape; dtype: string; range: ValueRange; mean: number }
  polarity: { border_median: number; flipped: boolean; range: ValueRange }
  crop: {
    /** Size of the image the box is measured in. */
    input: { width: number; height: number }
    otsu_cutoff: number
    /** The ink's bounding box. */
    box: PixelBox
    /** The padded square is centered on the box and this many pixels a side. */
    output_side: number
  }
  downsample: { block_size: number; shape: Shape; range: ValueRange }
  contrast: { before: ValueRange; after: ValueRange; shape: Shape }
  /** The FRAME packet rtl/packet.sv parses: sync, opcode, length, cells, XOR checksum. */
  frame: { sync: number; opcode: number; length: number; data_bytes: number; checksum: number }
}

interface StageOf<K extends StageKey> {
  key: K
  /** Real time the backend spent on this stage. */
  duration_ms: number
  /** Whether the stage altered the image; never faked to make a transition. */
  changed: boolean
  function: FunctionRef
  meta: StageMetaByKey[K]
  /**
   * PNG or SVG data URL of the stage's output, at most 512px on a side. Crop
   * sends none: the viewer zooms the previous image to the box instead.
   */
  image?: string
  /** 8 × 8 values, 0-255, rows first, for the stages after downsampling. */
  grid?: number[][]
  /** Every byte of the frame in send order, for the frame stage. */
  bytes?: number[]
}

/** One finished stage; narrows `meta` when switched on `key`. */
export type Stage = { [K in StageKey]: StageOf<K> }[StageKey]

/** One upload played back: every stage, in pipeline order. */
export interface PipelineRun {
  id: string
  filename: string
  /** Shown for the stages before the backend's first image (a local object URL). */
  preview: string
  stages: Stage[]
}
