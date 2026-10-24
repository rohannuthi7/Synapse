import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import UploadStatus from './UploadStatus'

describe('UploadStatus', () => {
  it('is a polite live region with the waiting copy and what the grid is for', () => {
    render(<UploadStatus />)
    const region = screen.getByRole('status')
    expect(region).toHaveAttribute('aria-live', 'polite')
    expect(region).toHaveTextContent('Waiting for an image')
    expect(region).toHaveTextContent('The 11 stages in the list run on the server')
    expect(region).toHaveTextContent('digit classifier we are building in SystemVerilog for a DE1-SoC FPGA')
  })

  it('names the file while uploading', () => {
    render(<UploadStatus uploading={new File(['x'], 'digit.png')} />)
    expect(screen.getByText('Uploading digit.png')).toBeInTheDocument()
  })
})
