import { Fragment } from 'react'
import type { CSSProperties } from 'react'
import { NARROW_SCREEN, useMediaQuery } from '../hooks/useMediaQuery'
import { FRAME_CHECKSUM_BYTES, FRAME_HEAD_BYTES } from '../pipeline/describe'
import styles from './FrameBytes.module.scss'

interface FrameBytesProps {
  /** Every byte of the packet, in send order. */
  bytes: readonly number[]
  /** Bytes fade in, 10ms apart in send order, when this turns true. */
  shown: boolean
  /** Labels for the head and checksum rows appear once the frame is ready. */
  labelled: boolean
  /** Jump straight to the end state, as after a pause or a jump. */
  instant: boolean
}

interface ByteRow {
  offset: number
  bytes: readonly number[]
  part: 'head' | 'data' | 'checksum'
  label?: string
}

// 16 cells a row as in the mockup; 8 on narrow screens, where 16 don't fit.
const DATA_PER_ROW = 16
const DATA_PER_ROW_NARROW = 8
const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0')

// Head row, the cells 16 to a row, then the checksum row, each with the
// offset of its first byte.
function toRows(bytes: readonly number[], perRow: number): ByteRow[] {
  const dataEnd = bytes.length - FRAME_CHECKSUM_BYTES
  const rows: ByteRow[] = [
    { offset: 0, bytes: bytes.slice(0, FRAME_HEAD_BYTES), part: 'head', label: 'sync · FRAME · length' },
  ]
  for (let at = FRAME_HEAD_BYTES; at < dataEnd; at += perRow) {
    rows.push({ offset: at, bytes: bytes.slice(at, Math.min(at + perRow, dataEnd)), part: 'data' })
  }
  rows.push({ offset: dataEnd, bytes: bytes.slice(dataEnd), part: 'checksum', label: 'checksum (XOR)' })
  return rows
}

function Row({ offset, bytes, part, label }: ByteRow) {
  return (
    <div className={styles.row} data-part={part}>
      <span className={styles.offset}>{hex(offset)}</span>
      <span className={styles.bytes}>
        {bytes.map((byte, i) => (
          // A real space between bytes: it is the mockup's 0.6em gap in Plex
          // Mono, keeps the underline unbroken, and reads and copies as hex.
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className={styles.byte} style={{ '--send-index': offset + i } as CSSProperties}>
              {hex(byte)}
            </span>
          </Fragment>
        ))}
      </span>
      {label && <span className={styles.label}>{label}</span>}
    </div>
  )
}

/** The packet as a hex dump: what would go down the UART, byte for byte. */
function FrameBytes({ bytes, shown, labelled, instant }: FrameBytesProps) {
  const narrow = useMediaQuery(NARROW_SCREEN)
  const rows = toRows(bytes, narrow ? DATA_PER_ROW_NARROW : DATA_PER_ROW)
  const [head, checksum] = [rows[0], rows[rows.length - 1]]
  return (
    <div className={styles.dump} data-shown={shown} data-labelled={labelled} data-instant={instant}>
      <Row {...head} />
      <div>
        {rows.slice(1, -1).map((row) => (
          <Row key={row.offset} {...row} />
        ))}
      </div>
      <Row {...checksum} />
    </div>
  )
}

export default FrameBytes
