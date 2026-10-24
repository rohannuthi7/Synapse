// The single-layer network on the Result stage: 64 inputs, ten rows of 64
// weights, one signed sum per digit. Pure, so every number on screen can be
// checked against the backend's scores without rendering.

/** Carbon blue 50 and red 50: positive weights pull a digit up, negative push it down. */
const POSITIVE_RGB = '69 137 255'
const NEGATIVE_RGB = '250 77 86'

/** Largest magnitude a signed byte holds; a weight of ±128 is full strength. */
export const WEIGHT_LIMIT = 128

/** Cell by cell, input brightness times that digit's weight: what the adder tree sums. */
export function products(grid: readonly (readonly number[])[], weights: readonly number[]): number[][] {
  return grid.map((row, r) => row.map((x, c) => x * weights[r * row.length + c]))
}

/** The digit's score, as rtl/score.sv computes it. */
export function dot(grid: readonly (readonly number[])[], weights: readonly number[]): number {
  return products(grid, weights).flat().reduce((sum, p) => sum + p, 0)
}

/**
 * Fill for one signed value: blue above zero, red below, transparent at zero,
 * opaque at `limit`. Laid over the viewer's layer color, so 0 reads as empty.
 */
export function signedColor(value: number, limit: number = WEIGHT_LIMIT): string {
  if (value === 0 || limit === 0) return 'transparent'
  const alpha = Math.min(Math.abs(value) / limit, 1)
  return `rgb(${value > 0 ? POSITIVE_RGB : NEGATIVE_RGB} / ${+alpha.toFixed(3)})`
}

/** Where one score's bar sits on its track, in percent of the track's width. */
export interface BarGeometry {
  start: number
  width: number
  negative: boolean
}

/** The zero axis, in percent: at the left when no score is negative, further right as they grow. */
export function zeroAxis(scores: readonly number[]): number {
  const low = Math.min(0, ...scores)
  const high = Math.max(0, ...scores)
  const span = high - low
  // low is 0 when nothing is negative; -0 / span would give -0, not 0.
  return low === 0 ? 0 : (-low / span) * 100
}

/**
 * Bars share one scale, so their lengths compare directly: a negative score
 * runs left from the zero axis, a positive one right.
 */
export function barGeometry(scores: readonly number[]): BarGeometry[] {
  const low = Math.min(0, ...scores)
  const high = Math.max(0, ...scores)
  const span = high - low || 1
  const axis = zeroAxis(scores)
  return scores.map((score) => {
    const width = (Math.abs(score) / span) * 100
    return { start: score < 0 ? axis - width : axis, width, negative: score < 0 }
  })
}

/** Digits other than the winner with the winner's score, lowest first. */
export function tiedWith(scores: readonly number[], digit: number): number[] {
  return scores.flatMap((score, d) => (d !== digit && score === scores[digit] ? [d] : []))
}

/** e.g. 45,072 and −42,486, with a real minus sign. */
export function formatScore(score: number): string {
  const text = Math.abs(score).toLocaleString('en-US')
  return score < 0 ? `−${text}` : text
}
