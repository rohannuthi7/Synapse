import { PIPELINE_STAGES } from './stages'
import type { StageKey } from './stages'
import type { FunctionRef, Shape, Stage, StageMetaByKey, ValueRange } from './types'

// Turns the backend's facts about a stage into the words on screen. Pure, so
// every sentence can be tested without rendering.

const MIB = 1024 * 1024

export interface MetaRow {
  label: string
  value: string
}

export function stageLabel(key: StageKey): string {
  return PIPELINE_STAGES.find((stage) => stage.key === key)?.label ?? key
}

/**
 * e.g. `preprocess.py › to_grayscale(img)`. The file name alone keeps it on
 * one line in the readout; `fullPath` gives `services/preprocess.py`.
 */
export function formatFunction({ file, name, params }: FunctionRef, { fullPath = false } = {}): string {
  const shown = fullPath ? file : file.slice(file.lastIndexOf('/') + 1)
  return `${shown} › ${name}(${params.join(', ')})`
}

/** A helper in the same file as its caller, named without the file: `otsu_threshold(grid)`. */
export function formatHelper({ name, params }: FunctionRef): string {
  return `${name}(${params.join(', ')})`
}

export function formatDuration(ms: number): string {
  return ms < 1 ? '< 1 ms' : `${Math.round(ms)} ms`
}

const formatInt = (n: number) => n.toLocaleString('en-US')
const formatShape = (shape: Shape) => shape.join(' × ')
const formatRange = ({ min, max }: ValueRange) => `${min}–${max}`
const formatHex = (bytes: number[]) =>
  bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')
const formatName = (mime: string) => mime.replace('image/', '').toUpperCase()
const formatMiB = (bytes: number, digits: number) => (bytes / MIB).toFixed(digits)
/** MiB from 1 MiB up, KiB below, so a small upload doesn't read as "0.1 MiB". */
const formatSize = (bytes: number) =>
  bytes >= MIB ? `${formatMiB(bytes, 1)} MiB` : `${(bytes / 1024).toFixed(1)} KiB`

/** Bytes in the FRAME packet: sync, opcode and length, the cells, the checksum. */
export function frameSize({ data_bytes }: StageMetaByKey['frame']): number {
  return FRAME_HEAD_BYTES + data_bytes + FRAME_CHECKSUM_BYTES
}

export const FRAME_HEAD_BYTES = 3
export const FRAME_CHECKSUM_BYTES = 1

/** Shown above the crop box while it is drawn. */
export function cropBoxLabel({ box }: StageMetaByKey['crop']): string {
  return `ink box · ${box.width} × ${box.height}`
}

/** The short note under a finished stage's time; only where something notable happened. */
export function stageNote(stage: Stage): string | null {
  switch (stage.key) {
    case 'orientation':
      return stage.changed ? `rotated ${stage.meta.rotation_degrees}°` : null
    case 'transparency':
      return stage.changed ? null : 'none found'
    case 'polarity':
      return stage.changed ? 'inverted' : null
    default:
      return null
  }
}

/** Time plus note, as shown under the stage name: "9 ms · rotated 90°". */
export function stageDetail(stage: Stage): string {
  const note = stageNote(stage)
  return note ? `${formatDuration(stage.duration_ms)} · ${note}` : formatDuration(stage.duration_ms)
}

/** One plain sentence saying what this stage did to this image. */
export function stageStatus(stage: Stage): string {
  switch (stage.key) {
    case 'received': {
      const name = stage.meta.filename ?? 'unnamed file'
      return `Upload received: ${name}, ${formatSize(stage.meta.bytes)}.`
    }
    case 'validated':
      return 'Allowed file type and size.'
    case 'decoded':
      return `Every pixel unpacked from the ${stage.meta.format}.`
    case 'orientation':
      return stage.changed
        ? `The camera tag said rotate ${stage.meta.rotation_degrees}°, so the pixels were turned upright.`
        : 'No rotation needed.'
    case 'transparency':
      return stage.changed ? 'Transparent areas were laid on white.' : 'No transparency found.'
    case 'grayscale':
      return 'Converting color to one brightness value per pixel.'
    case 'polarity':
      return stage.changed
        ? 'The paper was brighter than the ink, so every value was flipped.'
        : 'The ink was already brighter than the paper, so nothing was flipped.'
    case 'crop':
      return 'Finding the digit, cutting it out, and padding it to a square.'
    case 'downsample':
      return 'Averaging each block of pixels into one cell.'
    case 'contrast':
      return 'Stretching the 64 values so they use the full range.'
    case 'frame':
      return 'Packing the 64 values into a frame for the chip.'
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}

// How each function works, in one or two lines. Backticks mark inline code.
const METHODS: Record<StageKey, string> = {
  received: 'FastAPI reads the multipart body and hands the raw file bytes to the services.',
  validated:
    'Checks the byte count against 10 MiB, then the first bytes against the PNG and JPEG signatures.',
  decoded: 'Pillow reads the header, rejects images over 50 MP, then `load()` unpacks every pixel.',
  orientation:
    "`ImageOps.exif_transpose` applies the camera's rotation tag to the pixels, then removes the tag.",
  transparency: 'Pastes the image onto white, using its alpha channel as the mask.',
  grayscale:
    'Pillow\'s `convert("L")` weights each pixel as 0.299R + 0.587G + 0.114B, then NumPy wraps it as a uint8 grid.',
  polarity: 'Takes the median of the border pixels; if it is bright, flips every value with 255 − x.',
  crop: 'Otsu picks the ink cutoff, the bounding box is cut out, then padded to a square that divides by 8.',
  downsample: 'Reshapes the square into 8 × 8 blocks and averages each block into one cell.',
  contrast: 'Rescales the 64 values so the darkest becomes 0 and the brightest 255.',
  frame:
    'Wraps the 64 bytes in a sync byte, the FRAME opcode and a length, then an XOR checksum, the packet `rtl/packet.sv` parses.',
}

export function stageMethod(key: StageKey): string {
  return METHODS[key]
}

/** The metadata that matters for this stage, as label/value pairs. */
export function stageMetaRows(stage: Stage): MetaRow[] {
  switch (stage.key) {
    case 'received':
      return [
        { label: 'Bytes', value: formatInt(stage.meta.bytes) },
        { label: 'Type', value: stage.meta.declared_mime ?? 'not given' },
      ]
    case 'validated': {
      const { signature, detected_mime, bytes, limit_bytes } = stage.meta
      return [
        { label: 'Signature', value: `${formatHex(signature)} · ${formatName(detected_mime)}` },
        {
          label: 'Size',
          // '2.37 of 10 MiB' shares the unit; a small file names its own.
          value: bytes >= MIB
            ? `${formatMiB(bytes, 2)} of ${formatMiB(limit_bytes, 0)} MiB`
            : `${formatSize(bytes)} of ${formatMiB(limit_bytes, 0)} MiB`,
        },
      ]
    }
    case 'decoded': {
      const { shape, dtype, max_pixels } = stage.meta
      const megapixels = (shape[0] * shape[1]) / 1_000_000
      return [
        { label: 'Shape', value: formatShape(shape) },
        { label: 'Dtype', value: dtype },
        { label: 'Megapixels', value: `${megapixels.toFixed(1)} of ${max_pixels / 1_000_000}` },
      ]
    }
    case 'orientation': {
      const { exif_orientation, rotation_degrees, shape } = stage.meta
      const tag =
        exif_orientation === null
          ? 'none'
          : rotation_degrees
            ? `${exif_orientation} (rotate ${rotation_degrees}°)`
            : String(exif_orientation)
      return [
        { label: 'EXIF tag', value: tag },
        { label: 'Shape', value: formatShape(shape) },
      ]
    }
    case 'transparency':
      return [
        { label: 'Mode', value: stage.meta.mode },
        { label: 'Alpha', value: stage.meta.has_alpha ? 'yes' : 'none' },
      ]
    case 'grayscale':
      return [
        { label: 'Shape', value: formatShape(stage.meta.shape) },
        { label: 'Dtype', value: stage.meta.dtype },
        { label: 'Range', value: formatRange(stage.meta.range) },
        { label: 'Mean', value: String(stage.meta.mean) },
      ]
    case 'polarity':
      return [
        { label: 'Border median', value: String(stage.meta.border_median) },
        { label: 'Flipped', value: stage.meta.flipped ? 'yes' : 'no' },
        { label: 'Range', value: formatRange(stage.meta.range) },
      ]
    case 'crop': {
      const { otsu_cutoff, box, output_side } = stage.meta
      return [
        { label: 'Otsu cutoff', value: String(otsu_cutoff) },
        { label: 'Box (top, left)', value: `${box.top}, ${box.left}` },
        { label: 'Box (w × h)', value: `${box.width} × ${box.height}` },
        { label: 'Output', value: `${output_side} × ${output_side}` },
      ]
    }
    case 'downsample':
      return [
        { label: 'Block size', value: `${stage.meta.block_size} px` },
        { label: 'Shape', value: formatShape(stage.meta.shape) },
        { label: 'Range', value: formatRange(stage.meta.range) },
      ]
    case 'contrast':
      return [
        { label: 'Before (min–max)', value: formatRange(stage.meta.before) },
        { label: 'After (min–max)', value: formatRange(stage.meta.after) },
        { label: 'Shape', value: formatShape(stage.meta.shape) },
      ]
    case 'frame': {
      const { sync, opcode, length, data_bytes, checksum } = stage.meta
      return [
        { label: 'Total', value: `${frameSize(stage.meta)} bytes` },
        { label: 'Data', value: `${data_bytes} bytes` },
        { label: 'Sync, opcode, length', value: formatHex([sync, opcode, length]) },
        { label: 'Checksum (XOR)', value: formatHex([checksum]) },
      ]
    }
    default: {
      const _exhaustive: never = stage
      return _exhaustive
    }
  }
}
