import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StableHeight from './StableHeight'

describe('StableHeight', () => {
  function setup() {
    const { container } = render(
      <StableHeight variants={[<p key="a">Short</p>, <p key="b">A much longer line</p>]}>
        <p>Short</p>
      </StableHeight>,
    )
    return container.querySelectorAll('[data-sizer]')
  }

  it('renders every variant to reserve space, hidden from assistive tech and focus', () => {
    const sizers = setup()
    expect(sizers).toHaveLength(2)
    sizers.forEach((sizer) => {
      expect(sizer).toHaveAttribute('aria-hidden', 'true')
      expect(sizer).toHaveAttribute('inert')
    })
  })

  it('exposes only the current version to queries', () => {
    setup()
    expect(screen.getAllByText('Short')).toHaveLength(1)
    expect(screen.queryByText('A much longer line')).not.toBeInTheDocument()
  })
})
