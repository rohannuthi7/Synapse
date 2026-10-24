import { describe, expect, it } from 'vitest'
import {
  cropBoxLabel,
  formatDuration,
  formatFunction,
  stageDetail,
  stageMetaRows,
  stageNote,
  stageStatus,
} from './describe'
import { PLAYBACK_FIXTURE } from './fixtures/playbackRun'
import type { Stage } from './types'

const byKey = <K extends Stage['key']>(key: K) =>
  PLAYBACK_FIXTURE.stages.find((s) => s.key === key) as Extract<Stage, { key: K }>

describe('stage notes', () => {
  it('comes from changed and meta, never a fixed string', () => {
    expect(PLAYBACK_FIXTURE.stages.map(stageDetail)).toEqual([
      '2 ms',
      '1 ms',
      '38 ms',
      '9 ms · rotated 90°',
      '1 ms · none found',
      '4 ms',
      '3 ms · inverted',
      '21 ms',
      '2 ms',
      '1 ms',
      '1 ms',
    ])
  })

  it('follows the data when the stage did something else', () => {
    const orientation = byKey('orientation')
    expect(stageNote({ ...orientation, meta: { ...orientation.meta, rotation_degrees: 180 } })).toBe('rotated 180°')
    expect(stageNote({ ...orientation, changed: false })).toBeNull()
    expect(stageNote({ ...byKey('transparency'), changed: true })).toBeNull()
    expect(stageNote({ ...byKey('polarity'), changed: false })).toBeNull()
  })
})

describe('stageStatus', () => {
  it('says what each fixture stage did', () => {
    expect(stageStatus(byKey('received'))).toBe('Upload received: sample-7.jpg, 2.4 MiB.')
    expect(stageStatus(byKey('decoded'))).toBe('Every pixel unpacked from the JPEG.')
    expect(stageStatus(byKey('orientation'))).toBe(
      'The camera tag said rotate 90°, so the pixels were turned upright.',
    )
    expect(stageStatus(byKey('grayscale'))).toBe('Converting color to one brightness value per pixel.')
  })

  it('says so plainly when nothing changed', () => {
    expect(stageStatus({ ...byKey('orientation'), changed: false })).toBe('No rotation needed.')
    expect(stageStatus(byKey('transparency'))).toBe('No transparency found.')
    expect(stageStatus({ ...byKey('polarity'), changed: false })).toMatch(/nothing was flipped/)
  })
})

describe('stageMetaRows', () => {
  const rows = (stage: Stage) => stageMetaRows(stage).map(({ label, value }) => `${label}: ${value}`)

  it('matches the prototype for every stage', () => {
    expect(PLAYBACK_FIXTURE.stages.map(rows)).toEqual([
      ['Bytes: 2,481,152', 'Type: image/jpeg'],
      ['Signature: FF D8 FF · JPEG', 'Size: 2.37 of 10 MiB'],
      ['Shape: 4032 × 3024 × 3', 'Dtype: uint8', 'Megapixels: 12.2 of 50'],
      ['EXIF tag: 6 (rotate 90°)', 'Shape: 3024 × 4032 × 3'],
      ['Mode: RGB', 'Alpha: none'],
      ['Shape: 3024 × 4032', 'Dtype: uint8', 'Range: 18–236', 'Mean: 201'],
      ['Border median: 214', 'Flipped: yes', 'Range: 19–237'],
      ['Otsu cutoff: 97', 'Box (top, left): 704, 744', 'Box (w × h): 1536 × 2392', 'Output: 2392 × 2392'],
      ['Block size: 299 px', 'Shape: 8 × 8', 'Range: 14–231'],
      ['Before (min–max): 14–231', 'After (min–max): 0–255', 'Shape: 8 × 8'],
      ['Total: 68 bytes', 'Data: 64 bytes', 'Sync, opcode, length: A5 02 40', 'Checksum (XOR): 97'],
    ])
  })

  it('handles a photo with no EXIF tag', () => {
    const orientation = byKey('orientation')
    const untagged = { ...orientation, changed: false, meta: { ...orientation.meta, exif_orientation: null, rotation_degrees: 0 } }
    expect(rows(untagged)[0]).toBe('EXIF tag: none')
  })
})

describe('cropBoxLabel', () => {
  it("states the ink box's size in source pixels", () => {
    expect(cropBoxLabel(byKey('crop').meta)).toBe('ink box · 1536 × 2392')
  })
})

describe('formatting', () => {
  it('formats function references with their real parameters', () => {
    expect(formatFunction(byKey('grayscale').function)).toBe('preprocess.py › to_grayscale(img)')
    expect(formatFunction(byKey('frame').function)).toBe('encoder.py › encode_frame(grid)')
    expect(byKey('frame').function.planned).toBe(true)
  })

  it('shows the file name, or the full path under api/app when asked', () => {
    const fn = { file: 'services/preprocess.py', name: 'crop_digit', params: ['grid'] }
    expect(formatFunction(fn)).toBe('preprocess.py › crop_digit(grid)')
    expect(formatFunction(fn, { fullPath: true })).toBe('services/preprocess.py › crop_digit(grid)')
  })

  it('never rounds a real sub-millisecond time down to zero', () => {
    expect(formatDuration(0.4)).toBe('< 1 ms')
    expect(formatDuration(3.6)).toBe('4 ms')
  })
})

describe('upload sizes', () => {
  it('reads small uploads in KiB rather than as a fraction of a MiB', () => {
    const received = byKey('received')
    const small = { ...received, meta: { ...received.meta, filename: 'sample-digit.png', bytes: 59_153 } }
    expect(stageStatus(small)).toBe('Upload received: sample-digit.png, 57.8 KiB.')
    const validated = byKey('validated')
    const rows = stageMetaRows({ ...validated, meta: { ...validated.meta, bytes: 59_153 } })
    expect(rows[1].value).toBe('57.8 KiB of 10 MiB')
  })
})
