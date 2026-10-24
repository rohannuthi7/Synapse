import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import Workspace from './Workspace'

function setup(summary: ComponentProps<typeof Workspace>['summary']) {
  const onPick = vi.fn()
  render(
    <Workspace
      summary={summary}
      stages={
        <nav aria-label="Pipeline stages">
          <button type="button" onClick={onPick}>
            Decoded
          </button>
        </nav>
      }
      slot={<div />}
      readout={<div />}
    />,
  )
  const summaryButton = screen.getByRole('button', { name: /Stage|stages/ })
  return { onPick, summaryButton }
}

describe('Workspace on narrow screens', () => {
  it('sums up where the run is in one line', () => {
    const { summaryButton } = setup({ position: 6, label: 'Grayscale', status: 'current' })
    expect(summaryButton).toHaveTextContent('Stage 6 of 11 · GrayscaleAll stages')
  })

  it('says how many stages there are before anything has run', () => {
    const { summaryButton } = setup({ label: 'Not started', status: 'incomplete' })
    expect(summaryButton).toHaveTextContent('11 stages · Not started')
  })

  it('opens and closes the full list, and says which element it controls', () => {
    const { summaryButton } = setup({ position: 6, label: 'Grayscale', status: 'current' })
    const list = document.getElementById(summaryButton.getAttribute('aria-controls')!)!
    expect(summaryButton).toHaveAttribute('aria-expanded', 'false')
    expect(list).toHaveAttribute('data-open', 'false')

    fireEvent.click(summaryButton)
    expect(summaryButton).toHaveAttribute('aria-expanded', 'true')
    expect(summaryButton).toHaveTextContent('Hide stages')
    expect(list).toHaveAttribute('data-open', 'true')
  })

  it('closes the list after a stage is picked from it, so the viewer is in sight', () => {
    const { summaryButton, onPick } = setup({ position: 6, label: 'Grayscale', status: 'current' })
    fireEvent.click(summaryButton)
    fireEvent.click(screen.getByRole('button', { name: 'Decoded' }))
    expect(onPick).toHaveBeenCalledOnce()
    expect(summaryButton).toHaveAttribute('aria-expanded', 'false')
  })
})
