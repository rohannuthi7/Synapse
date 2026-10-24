import type { StageMetaByKey } from './types'

/** A rectangle in fractions of the square viewer: 0 is the top or left edge, 1 the far edge. */
export interface SlotRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CropGeometry {
  /** The ink's bounding box, where it sits on screen before the zoom. */
  box: SlotRect
  /** The padded output square, which the zoom scales up to fill the viewer. */
  region: SlotRect
}

/**
 * Places the backend's crop, measured in source pixels, on the square viewer,
 * where the source image is letterboxed by `object-fit: contain`.
 */
export function cropGeometry({ input, box, output_side }: StageMetaByKey['crop']): CropGeometry {
  // One source pixel in slot units, and where the image starts in the slot.
  const unit = 1 / Math.max(input.width, input.height)
  const offsetX = (1 - input.width * unit) / 2
  const offsetY = (1 - input.height * unit) / 2
  const toSlot = (left: number, top: number, width: number, height: number): SlotRect => ({
    x: offsetX + left * unit,
    y: offsetY + top * unit,
    width: width * unit,
    height: height * unit,
  })

  // crop_and_center pads the box to a square around the box's center.
  const centerX = box.left + box.width / 2
  const centerY = box.top + box.height / 2
  const half = output_side / 2
  return {
    box: toSlot(box.left, box.top, box.width, box.height),
    region: toSlot(centerX - half, centerY - half, output_side, output_side),
  }
}

/**
 * CSS transform (with origin 0 0) that scales `region` up to fill the viewer.
 * Translate percentages are of the viewer's own size, so this works at any width.
 */
export function fillTransform(region: SlotRect): string {
  const percent = (n: number) => `${+(n * 100).toFixed(4)}%`
  return `scale(${+(1 / region.width).toFixed(4)}) translate(${percent(-region.x)}, ${percent(-region.y)})`
}
