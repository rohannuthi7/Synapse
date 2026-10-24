import { describe, expect, it } from 'vitest'
import { cropGeometry, fillTransform } from './crop'
import { PLAYBACK_FIXTURE } from './fixtures/playbackRun'
import type { StageMetaByKey } from './types'

const fixtureMeta = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'crop')!.meta as StageMetaByKey['crop']

describe('cropGeometry', () => {
  it('maps a box on a square image straight to fractions', () => {
    const { box, region } = cropGeometry({
      input: { width: 800, height: 800 },
      otsu_cutoff: 100,
      box: { top: 200, left: 100, width: 400, height: 200 },
      output_side: 400,
    })
    expect(box).toEqual({ x: 0.125, y: 0.25, width: 0.5, height: 0.25 })
    // Square of 400 centered on (300, 300).
    expect(region).toEqual({ x: 0.125, y: 0.125, width: 0.5, height: 0.5 })
  })

  it('accounts for the letterbox around a portrait image', () => {
    const { box, region } = cropGeometry(fixtureMeta)
    // 3024 × 4032 in a square: full height, 75% wide, starting 12.5% in.
    expect(box.x).toBeCloseTo(0.125 + 744 / 4032)
    expect(box.y).toBeCloseTo(704 / 4032)
    expect(box.height).toBeCloseTo(2392 / 4032)
    expect(region.x).toBeCloseTo(0.125 + (744 + 768 - 1196) / 4032)
    expect(region.width).toBeCloseTo(2392 / 4032)
  })

  it('centers the padded square on the box when the box is not square', () => {
    const { box, region } = cropGeometry(fixtureMeta)
    expect(region.x + region.width / 2).toBeCloseTo(box.x + box.width / 2)
    expect(region.y + region.height / 2).toBeCloseTo(box.y + box.height / 2)
  })
})

describe('fillTransform', () => {
  it('scales the region to the full square and moves its corner to the origin', () => {
    expect(fillTransform({ x: 0.125, y: 0.25, width: 0.5, height: 0.5 })).toBe(
      'scale(2) translate(-12.5%, -25%)',
    )
  })

  it('is close to the prototype zoom for the fixture', () => {
    // The prototype used scale(1.6842) for its 304-of-512 box.
    const { region } = cropGeometry(fixtureMeta)
    expect(1 / region.width).toBeCloseTo(1.6856, 3)
  })
})
