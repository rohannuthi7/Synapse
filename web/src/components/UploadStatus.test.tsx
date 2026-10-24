import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ApiError } from '../api/client'
import UploadStatus from './UploadStatus'

const file = new File(['x'], 'digit.png', { type: 'image/png' })

describe('UploadStatus', () => {
  it('is a polite live region with the waiting copy when idle', () => {
    render(<UploadStatus state={{ status: 'idle' }} />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Waiting for an image')
    expect(region).toHaveTextContent('The 11 stages on the left run on the server')
  })

  it('names the file while uploading', () => {
    render(<UploadStatus state={{ status: 'uploading', file }} />)
    expect(screen.getByText('Uploading digit.png')).toBeInTheDocument()
  })

  it('reports what the backend verified on success', () => {
    const result = {
      id: 'x',
      upload: {
        filename: 'digit.png',
        declared_mime: 'image/png',
        detected_mime: 'image/png',
        bytes: 59153,
        width: 640,
        height: 640,
        format: 'PNG',
      },
      cells: Array.from({ length: 64 }, (_, index) => (index === 0 ? 255 : 0)),
    }
    render(<UploadStatus state={{ status: 'done', file, result }} />)
    expect(screen.getByRole('status')).toHaveTextContent('PNG, 640 × 640 px, 59,153 bytes.')
    expect(screen.getByRole('img', { name: '8 by 8 brightness' })).toBeInTheDocument()
  })

  it('explains a client-side rejection by type and by size', () => {
    const { rerender } = render(
      <UploadStatus state={{ status: 'rejected', rejection: { file: new File(['x'], 'notes.txt'), reason: 'type' } }} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('notes.txt is not a PNG or JPEG.')

    const big = new File([new Uint8Array(12 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' })
    rerender(<UploadStatus state={{ status: 'rejected', rejection: { file: big, reason: 'size' } }} />)
    expect(screen.getByRole('status')).toHaveTextContent('huge.jpg is 12.0 MiB; the limit is 10 MiB.')
  })

  it('shows the server error message and code', () => {
    const error = new ApiError('INVALID_IMAGE', 'File is not a PNG or JPEG.', 400)
    render(<UploadStatus state={{ status: 'error', error }} />)
    expect(screen.getByRole('status')).toHaveTextContent('File is not a PNG or JPEG. (INVALID_IMAGE)')
  })
})
