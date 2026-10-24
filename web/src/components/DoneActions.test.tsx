import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import DoneActions from './DoneActions'

function setup(props: Partial<ComponentProps<typeof DoneActions>> = {}) {
  const handlers = { onCopy: vi.fn(), onReplay: vi.fn(), onUploadAnother: vi.fn() }
  render(<DoneActions copyWhat="bytes" copyState="idle" note="What happens next." {...handlers} {...props} />)
  return handlers
}

describe('DoneActions', () => {
  it('offers copy, replay and upload, and prints the note', async () => {
    const h = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Copy bytes' }))
    await userEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await userEvent.click(screen.getByRole('button', { name: 'Upload another' }))
    expect(h.onCopy).toHaveBeenCalledOnce()
    expect(h.onReplay).toHaveBeenCalledOnce()
    expect(h.onUploadAnother).toHaveBeenCalledOnce()
    expect(screen.getByText('What happens next.')).toBeInTheDocument()
  })

  it('offers the bytes/grid switch only when there are bytes', async () => {
    setup()
    expect(screen.queryByRole('button', { name: 'Show grid' })).not.toBeInTheDocument()

    const onToggle = vi.fn()
    setup({ gridToggle: { showGrid: true, onToggle } })
    const toggle = screen.getByRole('button', { name: 'Show bytes' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('names what it copies and reports how the copy went', () => {
    setup({ copyWhat: 'values' })
    expect(screen.getByRole('button', { name: 'Copy values' })).toBeInTheDocument()
    setup({ copyState: 'copied' })
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    setup({ copyState: 'failed' })
    expect(screen.getByRole('button', { name: 'Copy failed' })).toBeInTheDocument()
  })
})
