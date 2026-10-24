import { describe, expect, it } from 'vitest'
import { PLAYBACK_FIXTURE } from './fixtures/playbackRun'
import { stageTimings, transitionFor } from './motion'
import type { Stage } from './types'

const stage = (key: Stage['key']) => PLAYBACK_FIXTURE.stages.find((s) => s.key === key) as Stage

describe('transitionFor', () => {
  it('uses the scan line on decode and the wipe on stages that changed the image', () => {
    expect(PLAYBACK_FIXTURE.stages.map(transitionFor)).toEqual([
      'none',
      'none',
      'line',
      'wipe',
      'none', // transparency: nothing to flatten in the fixture
      'wipe',
      'wipe',
      'crop',
      'downsample',
      'contrast',
      'frame',
    ])
  })

  it('never animates a change that did not happen', () => {
    for (const key of ['orientation', 'transparency', 'grayscale', 'polarity'] as const) {
      expect(transitionFor({ ...stage(key), changed: false } as Stage)).toBe('none')
    }
    expect(transitionFor({ ...stage('transparency'), changed: true } as Stage)).toBe('wipe')
  })
})

describe('stageTimings', () => {
  it('holds 900ms after animations, 300-600ms after instant stages, and 0 after the last', () => {
    expect(stageTimings(PLAYBACK_FIXTURE.stages).map((t) => t.holdMs)).toEqual([
      600, 300, 900, 900, 300, 900, 900, 900, 900, 900, 0,
    ])
  })

  it('uses the prototype end times; the frame is 10ms per byte plus the last fade', () => {
    expect(stageTimings(PLAYBACK_FIXTURE.stages).map((t) => t.endMs)).toEqual([
      0, 0, 430, 430, 0, 430, 430, 1370, 590, 350, 820,
    ])
  })
})
