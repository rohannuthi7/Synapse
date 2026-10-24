import { describe, expect, it } from 'vitest'
import { PLAYBACK_FIXTURE } from './fixtures/playbackRun'
import { barGeometry, dot, formatScore, products, signedColor, tiedWith, zeroAxis } from './network'

const grid = (cells: number[]) => {
  const flat = [...cells, ...Array(64 - cells.length).fill(0)]
  return Array.from({ length: 8 }, (_, r) => flat.slice(r * 8, r * 8 + 8))
}

describe('products and dot', () => {
  it('match the worked example in docs/projectspecs.txt', () => {
    // x = [200, 0, 50]; digit 0 weights [1, 1, -1] score 150, digit 1 [1, -1, 1] score 250.
    const x = grid([200, 0, 50])
    expect(dot(x, [1, 1, -1, ...Array(61).fill(0)])).toBe(150)
    expect(dot(x, [1, -1, 1, ...Array(61).fill(0)])).toBe(250)
    expect(products(x, [1, 1, -1, ...Array(61).fill(0)])[0].slice(0, 3)).toEqual([200, 0, -50])
  })

  it('reproduce the board scores in the fixture, cell for cell', () => {
    const result = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'result')!
    const input = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'frame')!.grid!
    if (result.key !== 'result') throw new Error('fixture has no result stage')
    result.meta.weights.forEach((row, d) => expect(dot(input, row)).toBe(result.meta.scores[d]))
  })
})

describe('signedColor', () => {
  it('is blue above zero, red below, and empty at zero', () => {
    expect(signedColor(0)).toBe('transparent')
    expect(signedColor(64)).toBe('rgb(69 137 255 / 0.5)')
    expect(signedColor(-128)).toBe('rgb(250 77 86 / 1)')
  })

  it('caps the strength at the limit', () => {
    expect(signedColor(500, 100)).toBe('rgb(69 137 255 / 1)')
  })
})

describe('barGeometry', () => {
  it('starts every bar at the left edge when no score is negative', () => {
    expect(zeroAxis([0, 50, 100])).toBe(0)
    expect(barGeometry([0, 50, 100])).toEqual([
      { start: 0, width: 0, negative: false },
      { start: 0, width: 50, negative: false },
      { start: 0, width: 100, negative: false },
    ])
  })

  it('runs negative scores left from the zero axis, on the same scale', () => {
    expect(zeroAxis([-100, 300])).toBe(25)
    expect(barGeometry([-100, 300])).toEqual([
      { start: 0, width: 25, negative: true },
      { start: 25, width: 75, negative: false },
    ])
  })

  it('survives all-zero scores', () => {
    expect(barGeometry([0, 0])).toEqual([
      { start: 0, width: 0, negative: false },
      { start: 0, width: 0, negative: false },
    ])
  })
})

describe('tiedWith and formatScore', () => {
  it('lists the other digits that share the winning score', () => {
    expect(tiedWith([5, 9, 1, 9], 1)).toEqual([3])
    expect(tiedWith([5, 9, 1, 2], 1)).toEqual([])
  })

  it('groups thousands and uses a real minus sign', () => {
    expect(formatScore(45072)).toBe('45,072')
    expect(formatScore(-2088960)).toBe('−2,088,960')
  })
})
