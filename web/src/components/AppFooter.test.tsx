import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AppFooter from './AppFooter'

describe('AppFooter', () => {
  it('shows version, short commit and online status', () => {
    render(<AppFooter health={{ status: 'online', version: '0.4', commit: '3fa1c2e9b7d0' }} />)
    expect(screen.getByText('API v0.4 · commit 3fa1c2e · Backend online')).toBeInTheDocument()
  })

  it('passes through an unknown commit', () => {
    render(<AppFooter health={{ status: 'online', version: '0.4', commit: 'unknown' }} />)
    expect(screen.getByText(/commit unknown/)).toBeInTheDocument()
  })

  it('says when the backend is offline or still being checked', () => {
    const { rerender } = render(<AppFooter health={{ status: 'checking' }} />)
    expect(screen.getByText('Checking backend')).toBeInTheDocument()
    rerender(<AppFooter health={{ status: 'offline' }} />)
    expect(screen.getByText('Backend offline')).toBeInTheDocument()
  })
})
