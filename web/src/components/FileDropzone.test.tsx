import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FileDropzone from './FileDropzone'

const TEXT = 'Drag a PNG or JPEG here'

function setup(props: { maxBytes?: number; disabled?: boolean } = {}) {
  const onFileSelected = vi.fn()
  const onFileRejected = vi.fn()
  const { container } = render(
    <FileDropzone onFileSelected={onFileSelected} onFileRejected={onFileRejected} {...props} />,
  )
  const box = screen.getByText(TEXT).closest('label') as HTMLElement
  const input = container.querySelector('input') as HTMLInputElement
  return { onFileSelected, onFileRejected, box, input }
}

describe('FileDropzone', () => {
  it('calls onFileSelected when a PNG is picked via the input', async () => {
    const { onFileSelected, input } = setup()
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await userEvent.upload(input, file)
    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('calls onFileSelected when a JPEG is dropped', () => {
    const { onFileSelected, box } = setup()
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    fireEvent.drop(box, { dataTransfer: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('passes a dropped .txt file on, so the server gives the real verdict', () => {
    const { onFileSelected, onFileRejected, box } = setup()
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    fireEvent.drop(box, { dataTransfer: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledWith(file)
    expect(onFileRejected).not.toHaveBeenCalled()
  })

  it('rejects a file over maxBytes by size', () => {
    const { onFileSelected, onFileRejected, box } = setup({ maxBytes: 3 })
    const file = new File(['1234'], 'big.png', { type: 'image/png' })
    fireEvent.drop(box, { dataTransfer: { files: [file] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(onFileRejected).toHaveBeenCalledWith({ file, reason: 'size' })
  })

  it('accepts a file exactly at maxBytes', () => {
    const { onFileSelected, box } = setup({ maxBytes: 4 })
    const file = new File(['1234'], 'edge.png', { type: 'image/png' })
    fireEvent.drop(box, { dataTransfer: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('ignores a cancelled picker (empty files)', () => {
    const { onFileSelected, onFileRejected, input } = setup()
    fireEvent.change(input, { target: { files: [] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(onFileRejected).not.toHaveBeenCalled()
  })

  it('ignores drops while disabled', () => {
    const { onFileSelected, box, input } = setup({ disabled: true })
    fireEvent.drop(box, { dataTransfer: { files: [new File(['x'], 'a.png', { type: 'image/png' })] } })
    expect(onFileSelected).not.toHaveBeenCalled()
    expect(input).toBeDisabled()
  })

  it('marks the box while a file is dragged over it', () => {
    const { box } = setup()
    expect(box).toHaveAttribute('data-dragging', 'false')
    fireEvent.dragEnter(box)
    expect(box).toHaveAttribute('data-dragging', 'true')
    fireEvent.dragLeave(box)
    expect(box).toHaveAttribute('data-dragging', 'false')
  })

  it('limits the picker to PNG and JPEG and labels the input', () => {
    const { input } = setup()
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg')
    expect(screen.getByLabelText(/choose file/i)).toBe(input)
  })
})
