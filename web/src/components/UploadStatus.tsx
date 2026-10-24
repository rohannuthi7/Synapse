import { PIPELINE_STAGES } from '../pipeline/stages'
import styles from './UploadStatus.module.scss'

interface UploadStatusProps {
  /** The file on its way to the backend, if one is. */
  uploading?: File
}

/** The empty page's status line; a polite live region so the upload is announced. */
function UploadStatus({ uploading }: UploadStatusProps) {
  return (
    <div role="status" aria-live="polite">
      {uploading ? (
        <>
          <p className={styles.title}>Uploading {uploading.name}</p>
          <p className={styles.body}>Sending the file to the backend.</p>
        </>
      ) : (
        <>
          <p className={styles.title}>Waiting for an image</p>
          <p className={styles.body}>
            Nothing has been uploaded yet. The {PIPELINE_STAGES.length} stages in the list run on the
            server, one after another, and each result plays back here in the same square.
          </p>
          <p className={styles.body}>
            The 8×8 grid goes over UART to a digit classifier written in SystemVerilog on a DE1-SoC
            FPGA, which replies with ten scores and the predicted digit.
          </p>
        </>
      )}
    </div>
  )
}

export default UploadStatus
