import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import styles from './FileDropzone.module.css'

interface FileDropzoneProps {
  /** Called with the chosen file. Called with exactly one file; extra files are ignored. */
  onFileSelected: (file: File) => void
  /** Comma-separated MIME list for the input's accept attribute and client-side drop filtering. */
  accept?: string
  /** Disables interaction and dims the box. */
  disabled?: boolean
}

/**
 * Lets the user pick or drop a single file and hands it to the parent.
 * That is its only job: it never stores the file; the parent owns it.
 */
function FileDropzone({
  onFileSelected,
  accept = 'image/png,image/jpeg,application/pdf',
  disabled = false,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleFile = (file: File | undefined) => {
    if (!file) return
    const allowed = accept.split(',').map((t) => t.trim())
    if (allowed.includes(file.type)) onFileSelected(file)
  }

  const handleDragOver = (event: DragEvent<HTMLLabelElement>) => {
    // Without this the browser treats the drop as "navigate to the file".
    event.preventDefault()
    if (!disabled) setIsDragging(true)
  }

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    // Cancels the browser's default of opening the dropped file.
    event.preventDefault()
    setIsDragging(false)
    if (!disabled) handleFile(event.dataTransfer.files[0])
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFile(event.target.files?.[0])
    // Clear so picking the same file again still fires onChange.
    event.target.value = ''
  }

  const className = [
    styles.dropzone,
    isDragging && styles.dragging,
    disabled && styles.disabled,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <label
      className={className}
      aria-disabled={disabled}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      <input
        className={styles.input}
        type="file"
        accept={accept}
        disabled={disabled}
        onChange={handleChange}
      />
      Drop a handwritten digit here, or click to choose a file
      <small className={styles.hint}>Accepted: {accept.split(',').join(', ')}</small>
    </label>
  )
}

export default FileDropzone
