import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it } from 'vitest'
import PixelGrid from './PixelGrid'

const values = Array.from({ length: 8 }, (_, r) => Array.from({ length: 8 }, (_, c) => r * 32 + c))

function setup(props: Partial<ComponentProps<typeof PixelGrid>> = {}) {
  const { container } = render(
    <PixelGrid values={values} filled lines="faint" showValues={false} instant={false} {...props} />,
  )
  const grid = container.firstElementChild as HTMLElement
  const cells = Array.from(grid.querySelectorAll('span'))
  return { grid, cells, lines: grid.querySelector('svg') as SVGElement }
}

describe('PixelGrid', () => {
  it('draws 64 cells in the shade of their value, rows first', () => {
    const { cells } = setup()
    expect(cells).toHaveLength(64)
    expect(cells[9].style.backgroundColor).toBe('rgb(33, 33, 33)')
  })

  it('hands each cell its row so CSS can stagger it 30ms per row', () => {
    const { cells } = setup()
    expect(cells[0].style.getPropertyValue('--row')).toBe('0')
    expect(cells[63].style.getPropertyValue('--row')).toBe('7')
  })

  it('prints values only when asked, in an ink that reads on its shade', () => {
    expect(setup().cells[0]).toHaveTextContent('')
    const { cells } = setup({ showValues: true })
    expect(cells[0]).toHaveTextContent('0')
    expect(cells[0]).toHaveAttribute('data-ink', 'light')
    expect(cells[63]).toHaveTextContent('231')
    expect(cells[63]).toHaveAttribute('data-ink', 'dark')
  })

  it('exposes fill, line and instant states for the transitions', () => {
    const { grid, lines } = setup({ filled: false, lines: 'full', instant: true })
    expect(grid).toHaveAttribute('data-filled', 'false')
    expect(grid).toHaveAttribute('data-instant', 'true')
    expect(lines).toHaveAttribute('data-lines', 'full')
  })
})
