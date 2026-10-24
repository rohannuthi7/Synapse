import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PIPELINE_STAGES } from '../pipeline/stages'
import StageList from './StageList'
import type { StageListItem } from './StageList'

const items: StageListItem[] = PIPELINE_STAGES.map((stage, index) => ({
  ...stage,
  status: index < 2 ? 'complete' : index === 2 ? 'current' : 'incomplete',
  detail: index < 2 ? `${index + 1} ms` : undefined,
  selectable: index <= 2,
}))

describe('StageList', () => {
  it('renders every stage, in order, as an ordered list', () => {
    render(<StageList items={items} />)
    const list = screen.getByRole('list')
    expect(list.tagName).toBe('OL')
    const rows = within(list).getAllByRole('listitem')
    expect(rows.map((row) => row.querySelector('button span')?.textContent)).toEqual(
      PIPELINE_STAGES.map((stage) => stage.label),
    )
  })

  it('states each stage status in text, not only with the mark', () => {
    render(<StageList items={items} />)
    expect(screen.getByRole('button', { name: /Received.*Complete/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Decoded.*Current/ })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: /Frame.*Not started/ })).toBeDisabled()
  })

  it('shows the detail line only for stages that have one', () => {
    render(<StageList items={items} />)
    expect(screen.getByText('1 ms')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Decoded/ }).textContent).toBe('DecodedCurrent')
  })

  it('reports the stage key when a selectable stage is clicked', async () => {
    const onSelect = vi.fn()
    render(<StageList items={items} onSelect={onSelect} />)
    await userEvent.click(screen.getByRole('button', { name: /Validated/ }))
    expect(onSelect).toHaveBeenCalledWith('validated')
  })

  it('draws a connecting line under every stage except the last', () => {
    const { container } = render(<StageList items={items} />)
    const lines = container.querySelectorAll('[data-complete]')
    expect(lines).toHaveLength(PIPELINE_STAGES.length - 1)
    expect(lines[0]).toHaveAttribute('data-complete', 'true')
    expect(lines[2]).toHaveAttribute('data-complete', 'false')
  })
})
