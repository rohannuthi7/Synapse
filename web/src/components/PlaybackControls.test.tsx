import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import PlaybackControls from './PlaybackControls'

function setup(playing = true) {
  const handlers = {
    onPrevious: vi.fn(),
    onTogglePlay: vi.fn(),
    onNext: vi.fn(),
    onReplay: vi.fn(),
    onSpeedChange: vi.fn(),
  }
  render(<PlaybackControls playing={playing} speed={1} footnote="Times shown are real." {...handlers} />)
  return handlers
}

describe('PlaybackControls', () => {
  it('labels every icon button and wires it up', async () => {
    const h = setup()
    const group = within(screen.getByRole('group', { name: 'Playback' }))
    await userEvent.click(group.getByRole('button', { name: 'Previous stage' }))
    await userEvent.click(group.getByRole('button', { name: 'Pause' }))
    await userEvent.click(group.getByRole('button', { name: 'Next stage' }))
    await userEvent.click(group.getByRole('button', { name: 'Replay' }))
    expect(h.onPrevious).toHaveBeenCalledOnce()
    expect(h.onTogglePlay).toHaveBeenCalledOnce()
    expect(h.onNext).toHaveBeenCalledOnce()
    expect(h.onReplay).toHaveBeenCalledOnce()
  })

  it('offers Play when paused', () => {
    setup(false)
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('shows the speed as three pressed/unpressed buttons', async () => {
    const h = setup()
    const speed = within(screen.getByRole('group', { name: 'Playback speed' }))
    expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true')
    expect(speed.getByRole('button', { name: '0.5×' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(speed.getByRole('button', { name: '2×' }))
    expect(h.onSpeedChange).toHaveBeenCalledWith(2)
  })

  it('prints the footnote', () => {
    setup()
    expect(screen.getByText('Times shown are real.')).toBeInTheDocument()
  })
})
