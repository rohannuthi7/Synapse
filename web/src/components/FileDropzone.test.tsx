import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import FileDropzone from './FileDropzone'

const TEXT = 'Drop a handwritten digit here, or click to choose a file'

function setup() {
  const onFileSelected = vi.fn()
  const { container } = render(<FileDropzone onFileSelected={onFileSelected} />)
  const root = screen.getByText(TEXT)
  const input = container.querySelector('input') as HTMLInputElement
  return { onFileSelected, root, input }
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
    const { onFileSelected, root } = setup()
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' })
    fireEvent.drop(root, { dataTransfer: { files: [file] } })
    expect(onFileSelected).toHaveBeenCalledTimes(1)
    expect(onFileSelected).toHaveBeenCalledWith(file)
  })

  it('ignores a dropped .txt file', () => {
    const { onFileSelected, root } = setup()
    const file = new File(['x'], 'a.txt', { type: 'text/plain' })
    fireEvent.drop(root, { dataTransfer: { files: [file] } })
    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('ignores a cancelled picker (empty files)', () => {
    const { onFileSelected, input } = setup()
    fireEvent.change(input, { target: { files: [] } })
    expect(onFileSelected).not.toHaveBeenCalled()
  })

  it('toggles dragging styling on dragenter/dragleave', () => {
    const { root } = setup()
    const box = root.closest('label') as HTMLElement
    expect(box.className).not.toMatch(/dragging/)
    fireEvent.dragEnter(box)
    expect(box.className).toMatch(/dragging/)
    fireEvent.dragLeave(box)
    expect(box.className).not.toMatch(/dragging/)
  })
})
