import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { failureFromRejection } from '../pipeline/failure'
import ErrorView from './ErrorView'

describe('ErrorView', () => {
  it('reports an oversized file as stopped at Validated, checked in this browser', () => {
    const file = new File([new Uint8Array(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    render(<ErrorView failure={failureFromRejection({ file, reason: 'size' })} onUploadAnother={vi.fn()} />)

    expect(screen.getByRole('alert')).toHaveTextContent('Pipeline stopped at stage 2 of 11: Validated')
    expect(screen.getByText(/^This browser, before uploading/)).toBeInTheDocument()
    expect(screen.getByText('FILE_TOO_LARGE')).toBeInTheDocument()
    expect(screen.getByText(`File is ${file.size} bytes; limit is 10485760.`)).toBeInTheDocument()
    // Nothing came back from a server, so there is no status and no JSON.
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show response JSON' })).not.toBeInTheDocument()

    const steps = within(screen.getByRole('list', { name: 'Where the run stopped' })).getAllByRole('listitem')
    expect(steps[1]).toHaveAttribute('data-state', 'failed')
    expect(steps[0]).toHaveAttribute('data-state', 'not-run')
  })

  it('moves focus to the heading and offers a fresh start', async () => {
    const onUploadAnother = vi.fn()
    render(
      <ErrorView
        failure={{ origin: 'network', code: 'NETWORK_ERROR', message: 'Could not reach the backend.', completed: [] }}
        onUploadAnother={onUploadAnother}
      />,
    )
    expect(screen.getByRole('alert')).toHaveFocus()
    await userEvent.click(screen.getByRole('button', { name: 'Upload another image' }))
    expect(onUploadAnother).toHaveBeenCalledOnce()
  })
})
