// Which ink keeps a number readable on a gray cell of value 0-255. The
// prototype switched at 128, which leaves mid-grays near 2.3:1; choosing by
// actual contrast keeps every cell at 4.5:1 or better.

/** WCAG relative luminance of an sRGB channel value, 0-255. */
function luminance(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** 'light' is white text, 'dark' is black text. */
export function cellInk(value: number): 'light' | 'dark' {
  return contrastRatio(value, 255) >= contrastRatio(value, 0) ? 'light' : 'dark'
}
