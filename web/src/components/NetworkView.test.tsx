import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PLAYBACK_FIXTURE } from '../pipeline/fixtures/playbackRun'
import type { StageMetaByKey } from '../pipeline/types'
import NetworkView from './NetworkView'

const result = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'result')!
const meta = result.meta as StageMetaByKey['result']
const grid = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'frame')!.grid!

const draw = (overrides: Partial<StageMetaByKey['result']> = {}, phase = 3) =>
  render(<NetworkView grid={grid} meta={{ ...meta, ...overrides }} phase={phase} settled={false} />).container

describe('NetworkView', () => {
  it('draws ten rows of weights with their scores and marks the winner', () => {
    const view = draw()
    const rows = view.querySelectorAll('[data-winner]')
    expect(rows).toHaveLength(10)
    expect(view.querySelector('[data-winner="true"]')).toHaveTextContent('273,434')
    expect(view).toHaveTextContent('Predicted2')
    expect(view).not.toHaveTextContent('tie')
  })

  it('shows a tie tag when another digit has the same score', () => {
    expect(draw({ tie: true })).toHaveTextContent('tie')
  })

  it('swaps a digit’s weights for input × weight when pointed at, and says the sum', () => {
    const view = draw()
    const row = view.querySelectorAll('[data-winner]')[7]
    fireEvent.mouseEnter(row)
    expect(row).toHaveAttribute('data-active', 'true')
    expect(view).toHaveTextContent('7: Σ x·w = 43,958')
    fireEvent.mouseLeave(row.parentElement!)
    expect(view).toHaveTextContent('Hover a digit for x · w')
  })

  it('holds the bars and the digit back until their phases', () => {
    expect(draw({}, 1).firstElementChild).toHaveAttribute('data-phase', '1')
    const settled = render(<NetworkView grid={grid} meta={meta} phase={0} settled />).container
    expect(settled.firstElementChild).toHaveAttribute('data-phase', '3')
  })
})
