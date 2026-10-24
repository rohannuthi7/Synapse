import { cleanup, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import StageViewer from './StageViewer'

const base: ComponentProps<typeof StageViewer> = {
  image: 'data:new',
  previousImage: 'data:old',
  transition: 'wipe',
  phase: 0,
  settled: false,
  speed: 1,
  caption: 'Stage 6 of 11, Grayscale.',
}

function setup(props: Partial<ComponentProps<typeof StageViewer>> = {}) {
  const { container } = render(<StageViewer {...base} {...props} />)
  const [under, over] = Array.from(container.querySelectorAll('img'))
  const line = container.querySelector('[data-scan]') as HTMLElement
  const figure = container.querySelector('figure') as HTMLElement
  return { under, over, line, figure }
}

describe('StageViewer', () => {
  it('keeps the old image underneath while the new one is wiped in', () => {
    const { under, over, line } = setup()
    expect(under).toHaveAttribute('src', 'data:old')
    expect(over).toHaveAttribute('src', 'data:new')
    expect(over).toHaveAttribute('data-wipe', 'hidden')
    expect(line).toHaveAttribute('data-scan', 'ready')
  })

  it('reveals the new image and sweeps the line together in phase 1', () => {
    const { over, line } = setup({ phase: 1 })
    expect(over).toHaveAttribute('data-wipe', 'revealing')
    expect(line).toHaveAttribute('data-scan', 'sweeping')
  })

  it('runs only the line over the decoded image, which replaces the preview at once', () => {
    const { under, over, line } = setup({ transition: 'line', phase: 1 })
    expect(under).toHaveAttribute('src', 'data:new')
    expect(over).toHaveAttribute('data-wipe', 'none')
    expect(line).toHaveAttribute('data-scan', 'sweeping')
  })

  it('shows the final picture with no motion when settled', () => {
    const { under, over, line } = setup({ settled: true })
    expect(under).toHaveAttribute('src', 'data:new')
    expect(over).toHaveAttribute('data-wipe', 'none')
    expect(line).toHaveAttribute('data-scan', 'off')
  })

  it('hands the playback speed to CSS so durations scale with it', () => {
    const { figure } = setup({ speed: 2 })
    expect(figure.style.getPropertyValue('--playback-speed')).toBe('2')
  })

  it('is a figure whose caption says what it shows', () => {
    setup()
    const figure = screen.getByRole('figure')
    expect(figure.querySelector('figcaption')).toHaveTextContent('Stage 6 of 11, Grayscale.')
  })

})

describe('StageViewer grid stages', () => {
  const averaged = Array.from({ length: 8 }, () => Array(8).fill(100))
  const stretched = Array.from({ length: 8 }, () => Array(8).fill(200))

  function gridSetup(props: Partial<ComponentProps<typeof StageViewer>>) {
    const { container } = render(<StageViewer {...base} {...props} />)
    const grid = container.querySelector('[data-filled]') as HTMLElement
    return {
      grid,
      lines: grid.querySelector('svg')?.dataset.lines,
      firstCell: grid.querySelector('span') as HTMLElement,
    }
  }

  it('downsample: lines appear over the image first, then the cells fill', () => {
    const p0 = gridSetup({ transition: 'downsample', grid: averaged, phase: 0 })
    expect([p0.lines, p0.grid.dataset.filled]).toEqual(['hidden', 'false'])
    cleanup()
    const p1 = gridSetup({ transition: 'downsample', grid: averaged, phase: 1 })
    expect([p1.lines, p1.grid.dataset.filled]).toEqual(['full', 'false'])
    cleanup()
    const p2 = gridSetup({ transition: 'downsample', grid: averaged, phase: 2 })
    expect([p2.lines, p2.grid.dataset.filled]).toEqual(['full', 'true'])
  })

  it('contrast: shows the averaged shades, then shifts to the stretched ones', () => {
    const p0 = gridSetup({ transition: 'contrast', grid: stretched, previousGrid: averaged, phase: 0 })
    expect(p0.firstCell.style.backgroundColor).toBe('rgb(100, 100, 100)')
    expect(p0.lines).toBe('faint')
    cleanup()
    const p1 = gridSetup({ transition: 'contrast', grid: stretched, previousGrid: averaged, phase: 1 })
    expect(p1.firstCell.style.backgroundColor).toBe('rgb(200, 200, 200)')
  })

  it('shows the end state at once when settled', () => {
    const { grid, lines } = gridSetup({ transition: 'downsample', grid: averaged, settled: true })
    expect([lines, grid.dataset.filled, grid.dataset.instant]).toEqual(['full', 'true', 'true'])
  })
})

describe('StageViewer crop', () => {
  const crop = {
    geometry: {
      box: { x: 0.25, y: 0.2, width: 0.4, height: 0.6 },
      region: { x: 0.15, y: 0.2, width: 0.6, height: 0.6 },
    },
    label: 'ink box · 1536 × 2392',
  }

  function cropSetup(phase: number, settled = false, transition: 'crop' | 'downsample' = 'crop') {
    const { container } = render(
      <StageViewer {...base} transition={transition} crop={crop} phase={phase} settled={settled} />,
    )
    const q = (selector: string) => container.querySelector(selector) as HTMLElement
    return { layer: q('[data-zoom]'), box: q('[class*=box][data-shown]'), dim: q('svg[data-shown]') }
  }

  it('places the box from the data and labels it', () => {
    const { box } = cropSetup(1)
    expect(box.style.left).toBe('25%')
    expect(box.style.top).toBe('20%')
    expect(box.style.width).toBe('40%')
    expect(box).toHaveTextContent('ink box · 1536 × 2392')
  })

  it('draws the box, then dims the outside, then zooms with both fading out', () => {
    const p0 = cropSetup(0)
    expect([p0.box.dataset.shown, p0.dim.dataset.shown, p0.layer.dataset.zoom]).toEqual(['false', 'false', 'off'])
    expect(p0.layer.style.transform).toBe('none')
    cleanup()

    const p1 = cropSetup(1)
    expect([p1.box.dataset.shown, p1.dim.dataset.shown]).toEqual(['true', 'false'])
    cleanup()

    const p2 = cropSetup(2)
    expect([p2.box.dataset.shown, p2.dim.dataset.shown]).toEqual(['true', 'true'])
    cleanup()

    const p3 = cropSetup(3)
    expect([p3.box.dataset.shown, p3.dim.dataset.shown, p3.layer.dataset.zoom]).toEqual(['false', 'false', 'zooming'])
    expect(p3.layer.style.transform).toBe('scale(1.6667) translate(-15%, -20%)')
  })

  it('shows the zoomed square at once when jumped to, and keeps it on later stages', () => {
    const settled = cropSetup(0, true)
    expect(settled.layer.dataset.zoom).toBe('done')
    expect(settled.box.dataset.shown).toBe('false')
    cleanup()

    const later = cropSetup(0, false, 'downsample')
    expect(later.layer.dataset.zoom).toBe('done')
    expect(later.layer.style.transform).toContain('scale(1.6667)')
  })
})
