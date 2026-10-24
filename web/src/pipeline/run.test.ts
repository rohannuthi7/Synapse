import { describe, expect, it } from 'vitest'
import { PLAYBACK_FIXTURE } from './fixtures/playbackRun'
import { imageAt, runTiming, stageListItems } from './run'

const run = PLAYBACK_FIXTURE
const indexOf = (key: string) => run.stages.findIndex((s) => s.key === key)

describe('imageAt', () => {
  it('shows the local preview before the backend has sent an image', () => {
    expect(imageAt(run, -1)).toBe(run.preview)
    expect(imageAt(run, indexOf('received'))).toBe(run.preview)
  })

  it("carries the last image forward through stages that didn't change it", () => {
    expect(imageAt(run, indexOf('transparency'))).toBe(run.stages[indexOf('orientation')].image)
  })

  it("uses the stage's own image when it has one", () => {
    expect(imageAt(run, indexOf('grayscale'))).toBe(run.stages[indexOf('grayscale')].image)
  })
})

describe('stageListItems', () => {
  it('marks earlier stages complete with real times, the current one current, the rest not started', () => {
    const items = stageListItems(run, { index: 5, reached: 5, finished: false })
    expect(items.map((i) => i.status)).toEqual([
      ...Array(5).fill('complete'),
      'current',
      ...Array(6).fill('incomplete'),
    ])
    expect(items[3].detail).toBe('9 ms · rotated 90°')
    expect(items[5].detail).toBe('4 ms')
    expect(items[6].detail).toBeUndefined()
    expect(items.map((i) => i.selectable)).toEqual([...Array(6).fill(true), ...Array(6).fill(false)])
  })

  it('keeps later reached stages complete after jumping back', () => {
    const items = stageListItems(run, { index: 2, reached: 7, finished: false })
    expect(items[2].status).toBe('current')
    expect(items[7]).toMatchObject({ status: 'complete', selectable: true })
    expect(items[8].status).toBe('incomplete')
  })

  it('marks every stage complete once the run has finished', () => {
    const items = stageListItems(run, { index: 11, reached: 11, finished: true })
    expect(items.every((i) => i.status === 'complete')).toBe(true)
  })
})

describe('stageListItems for a run that ends before Frame', () => {
  it('marks the stages the backend does not run as planned, never as reachable', () => {
    const shorter = { ...run, stages: run.stages.slice(0, 10) }
    const items = stageListItems(shorter, { index: 9, reached: 9, finished: true })
    expect(items[10]).toMatchObject({ key: 'frame', planned: true, selectable: false, status: 'incomplete' })
    expect(items[11]).toMatchObject({ key: 'result', planned: true, selectable: false, status: 'incomplete' })
    expect(items[9]).toMatchObject({ planned: false, status: 'complete' })
  })
})

describe('runTiming', () => {
  it('splits the real time into preprocessing, frame and board', () => {
    // The fixture's stages add up to 97 ms: 82 before the frame, 1 for it, 14 on the board.
    expect(runTiming(run)).toEqual({ total: 97, preprocessing: 82, frame: 1, board: 14 })
  })
})
