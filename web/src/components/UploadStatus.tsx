import type { UploadState } from '../hooks/useUploadDigit'
import { PIPELINE_STAGES } from '../pipeline/stages'
import { MAX_UPLOAD_BYTES } from '../pipeline/upload'
import styles from './UploadStatus.module.scss'

interface UploadStatusProps {
  state: UploadState
}

const MIB = 1024 * 1024

function describe(state: UploadState): { title: string; body: string } {
  switch (state.status) {
    case 'idle':
      return {
        title: 'Waiting for an image',
        body: `Nothing has been uploaded yet. The ${PIPELINE_STAGES.length} stages on the left run on the server, one after another, and each result plays back here in the same square.`,
      }
    case 'uploading':
      return { title: `Uploading ${state.file.name}`, body: 'Sending the file to the backend.' }
    case 'done': {
      const { format, width, height, bytes } = state.result.upload
      return {
        title: 'Upload accepted',
        body: `${format}, ${width} × ${height} px, ${bytes.toLocaleString('en-US')} bytes. The 8×8 brightness frame is ready.`,
      }
    }
    case 'rejected': {
      const { file, reason } = state.rejection
      return reason === 'type'
        ? { title: 'File not accepted', body: `${file.name} is not a PNG or JPEG.` }
        : {
            title: 'File not accepted',
            body: `${file.name} is ${(file.size / MIB).toFixed(1)} MiB; the limit is ${MAX_UPLOAD_BYTES / MIB} MiB.`,
          }
    }
    case 'error':
      return { title: 'Upload failed', body: `${state.error.message} (${state.error.code})` }
    default: {
      const _exhaustive: never = state
      return _exhaustive
    }
  }
}

/** The readout's status line; a polite live region so each change is announced. */
function UploadStatus({ state }: UploadStatusProps) {
  const { title, body } = describe(state)
  const cells = state.status === 'done' && Array.isArray(state.result.cells) ? state.result.cells : []
  return (
    <div role="status" aria-live="polite">
      <p className={styles.title}>{title}</p>
      <p className={styles.body}>{body}</p>
      {cells.length === 64 && (
        <div className={styles.grid} role="img" aria-label="8 by 8 brightness">
          {cells.map((value, index) => (
            <span
              key={index}
              className={styles.cell}
              style={{ background: `rgb(${value} ${value} ${value})` }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default UploadStatus
