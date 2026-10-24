import { describe, expect, it } from 'vitest'
import { cellInk, contrastRatio } from './cellText'

describe('cellInk', () => {
  it('uses white on dark cells and black on light ones', () => {
    expect(cellInk(0)).toBe('light')
    expect(cellInk(255)).toBe('dark')
  })

  it('keeps every possible cell value at 4.5:1 or better', () => {
    for (let v = 0; v <= 255; v++) {
      const ink = cellInk(v) === 'light' ? 255 : 0
      expect(contrastRatio(v, ink)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
