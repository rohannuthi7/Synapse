import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'
import { Add, Upload } from '@carbon/icons-react'
import { ACCEPTED_IMAGE_TYPES, MAX_UPLOAD_BYTES } from '../pipeline/upload'
import type { FileRejection } from '../pipeline/upload'
import styles from './FileDropzone.module.scss'

interface FileDropzoneProps {
  /** Called with the chosen file. Called with exactly one file; extra files are ignored. */
  onFileSelected: (file: File) => void
  /** Called instead of onFileSelected when the file is over `maxBytes`. */
  onFileRejected?: (rejection: FileRejection) => void
  /** MIME types the file picker offers. */
  accept?: readonly string[]
  /** Largest file, in bytes, handed to onFileSelected. */
  maxBytes?: number
  /** Disables interaction, e.g. while an upload is in flight. */
  disabled?: boolean
}

/**
 * The empty viewer square: lets the user pick or drop a single file and hands
 * it to the parent. That is its only job: it never stores the file; the
 * parent owns it.
 */
function FileDropzone({
  onFileSelected,
  onFileRejected,
  accept = ACCEPTED_IMAGE_TYPES,
  maxBytes = MAX_UPLOAD_BYTES,
  disabled = false,
}: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  // Only size is checked here. A wrong type goes to the server, whose
  // signature check is the one that counts and is shown in the error view.
  const handleFile = (file: File | undefined) => {
    if (!file) return
    if (file.size > maxBytes) onFileRejected?.({ file, reason: 'size' })
    else onFileSelected(file)
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

  return (
    <figure className={styles.figure}>
      <label
        className={styles.dropzone}
        data-dragging={isDragging}
        aria-disabled={disabled}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <Upload size={32} className={styles.uploadIcon} aria-hidden="true" />
        <span className={styles.text}>
          <span className={styles.title}>Drag a PNG or JPEG here</span>
          <span className={styles.hint}>or choose one from your computer. Max 10 MiB.</span>
        </span>
        <span className={styles.chooseButton}>
          Choose file
          <Add size={16} aria-hidden="true" />
        </span>
        <input
          className={styles.input}
          type="file"
          accept={accept.join(',')}
          disabled={disabled}
          onChange={handleChange}
        />
      </label>
      <figcaption className={styles.caption}>
        Drop area. Accepts PNG or JPEG up to 10 MiB.
      </figcaption>
    </figure>
  )
}

export default FileDropzone
