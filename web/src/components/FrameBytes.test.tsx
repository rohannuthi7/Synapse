import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PLAYBACK_FIXTURE } from '../pipeline/fixtures/playbackRun'
import FrameBytes from './FrameBytes'

const bytes = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'frame')!.bytes!

function setup(shown = true, labelled = true) {
  const { container } = render(<FrameBytes bytes={bytes} shown={shown} labelled={labelled} instant={false} />)
  const rows = Array.from(container.querySelectorAll('[data-part]')) as HTMLElement[]
  return { dump: container.firstElementChild as HTMLElement, rows }
}

describe('FrameBytes', () => {
  it('lays the packet out as head, four rows of 16 cells, then the checksum', () => {
    const { rows } = setup()
    expect(rows.map((r) => r.dataset.part)).toEqual(['head', 'data', 'data', 'data', 'data', 'checksum'])
    // Offset, then the space-separated bytes, then the label.
    expect(rows[0].textContent).toBe('00A5 02 40sync · FRAME · length')
    expect(rows[1].textContent?.startsWith('0300 00 12 C8')).toBe(true)
    expect(rows[1].querySelectorAll('[style]')).toHaveLength(16)
    expect(rows[4].textContent?.startsWith('33')).toBe(true)
    expect(rows[5].textContent).toBe('4397checksum (XOR)')
  })

  it('numbers each byte by its place in the send order', () => {
    const { dump } = setup()
    const sendIndexes = Array.from(dump.querySelectorAll<HTMLElement>('[style]')).map((b) =>
      b.style.getPropertyValue('--send-index'),
    )
    expect(sendIndexes).toEqual(bytes.map((_, i) => String(i)))
  })

  it('exposes shown and labelled states for the fade-in', () => {
    const { dump } = setup(false, false)
    expect(dump).toHaveAttribute('data-shown', 'false')
    expect(dump).toHaveAttribute('data-labelled', 'false')
  })
})

describe('FrameBytes on narrow screens', () => {
  it('lays the 64 cells out 8 to a row, with offsets that still count bytes', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('max-width'),
      addEventListener: () => {},
      removeEventListener: () => {},
    }))
    const { container } = render(<FrameBytes bytes={bytes} shown labelled instant={false} />)
    const rows = Array.from(container.querySelectorAll('[data-part="data"]'))
    expect(rows).toHaveLength(8)
    expect(rows[1].textContent?.startsWith('0B')).toBe(true)
    vi.unstubAllGlobals()
  })
})
