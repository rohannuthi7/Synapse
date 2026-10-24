import { dot, tiedWith } from '../network'
import type { FunctionRef, PipelineRun } from '../types'
import { FIXTURE_WEIGHTS } from './weights'

// Stand-in for the backend's stage list until it returns one (step 8). Every
// number is copied from the Playback prototype so the page can be built and
// checked against it; nothing here is shown for a real upload.

// The upright photo is 3024 wide by 4032 tall. The prototype's numbers only
// fit that shape: its ink box (left 744, top 704, 1536 × 2392) runs past the
// bottom of a 4032-wide one. Its "Shape" values read width × height.
const PHOTO = { width: 3024, height: 4032 }
const INK_BOX = { top: 704, left: 744, width: 1536, height: 2392 }

// The prototype drew its 7 inside the box (136, 120, 244 × 304) of a 512
// square; this maps that box onto the fixture's ink box, so the crop
// animation, which is placed from the data, lands on the drawn digit.
const PLACE_DIGIT = `translate(${INK_BOX.left} ${INK_BOX.top}) scale(${INK_BOX.width / 244} ${INK_BOX.height / 304}) translate(-136 -120)`

interface DigitLook {
  paper: string
  ink: string
  /** The photo arrives on its side until the orientation stage turns it. */
  sideways?: boolean
}

// The prototype's hand-drawn 7 as an SVG data URL with the photo's aspect
// ratio, at most 512px on a side like the backend's stage images.
function digitImage({ paper, ink, sideways = false }: DigitLook): string {
  const { width, height } = PHOTO
  const [outerW, outerH] = sideways ? [height, width] : [width, height]
  const scale = 512 / Math.max(outerW, outerH)
  // Rotating a quarter turn counterclockwise puts the top of the 7 on the left.
  const turn = sideways ? `translate(0 ${width}) rotate(-90)` : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${outerW} ${outerH}" width="${outerW * scale}" height="${outerH * scale}"><rect width="${outerW}" height="${outerH}" fill="${paper}"/><g transform="${turn}"><g transform="${PLACE_DIGIT}" fill="none" stroke="${ink}" stroke-linecap="round" stroke-linejoin="round"><path d="M156 158 C 220 150, 300 146, 360 140 C 320 210, 270 300, 232 404" stroke-width="26"/><path d="M220 268 L 318 262" stroke-width="22"/></g></g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const SIDEWAYS = digitImage({ paper: '#e8dfca', ink: '#25418f', sideways: true })
const UPRIGHT = digitImage({ paper: '#e8dfca', ink: '#25418f' })
const GRAY = digitImage({ paper: '#dcdcdc', ink: '#3d3d3d' })
const INVERTED = digitImage({ paper: '#232323', ink: '#c2c2c2' })

// The stretched 8 × 8 values, rows first.
const STRETCHED = [
  0x00, 0x00, 0x12, 0xc8, 0xff, 0xe0, 0xd4, 0x3a, 0x00, 0x00, 0x00, 0x08, 0x2c, 0x4e, 0xf2, 0x6b,
  0x00, 0x00, 0x00, 0x00, 0x00, 0xb7, 0xc1, 0x0a, 0x00, 0x00, 0x00, 0x06, 0x7a, 0xf8, 0x22, 0x00,
  0x00, 0x00, 0x00, 0x5c, 0xff, 0x6e, 0x00, 0x00, 0x00, 0x00, 0x1e, 0xe9, 0xa3, 0x04, 0x00, 0x00,
  0x00, 0x00, 0x8d, 0xf4, 0x2b, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc2, 0x7f, 0x00, 0x00, 0x00, 0x00,
]
// Before stretching, the same cells sat in 14-231.
const AVERAGED = STRETCHED.map((v) => Math.round(14 + (v * 217) / 255))

const toRows = (values: number[]) =>
  Array.from({ length: 8 }, (_, row) => values.slice(row * 8, row * 8 + 8))

// The FRAME packet from docs/packet_theory.md and rtl/packet.sv: sync byte,
// FRAME opcode, payload length, the 64 cells, then the XOR of every byte
// before it. The prototype's 7E 01 / 40 00 / CRC draft is not what the
// hardware parses.
const SYNC = 0xa5
const FRAME_OPCODE = 0x02
const PACKET_HEAD = [SYNC, FRAME_OPCODE, STRETCHED.length]
const CHECKSUM = [...PACKET_HEAD, ...STRETCHED].reduce((xor, byte) => xor ^ byte, 0)

// The board's answer, scored the way rtl/score.sv does: 64 brightness bytes
// times each digit's 64 weights. Lowest digit wins a tie, as in
// rtl/winning_digit.sv.
const SCORES = FIXTURE_WEIGHTS.map((row) => dot(toRows(STRETCHED), row))
const WINNER = SCORES.indexOf(Math.max(...SCORES))
const TIE = tiedWith(SCORES, WINNER).length > 0

// The RESULT packet rtl/result.sv sends: sync, opcode 0x83, length 42, ten
// little-endian int32 scores, the digit, the flags, then the XOR checksum.
const int32le = (n: number) => [0, 8, 16, 24].map((shift) => (n >> shift) & 0xff)
const RESULT_HEAD = [SYNC, 0x83, 42]
const RESULT_BODY = [...SCORES.flatMap(int32le), WINNER, TIE ? 1 : 0]
const RESULT_CHECKSUM = [...RESULT_HEAD, ...RESULT_BODY].reduce((xor, byte) => xor ^ byte, 0)

const fn = (file: string, name: string, params: string[], planned?: boolean): FunctionRef => ({
  file,
  name,
  params,
  ...(planned && { planned }),
})

export const PLAYBACK_FIXTURE: PipelineRun = {
  id: 'fixture-playback',
  filename: 'sample-7.jpg',
  preview: SIDEWAYS,
  stages: [
    {
      key: 'received',
      duration_ms: 2,
      changed: false,
      function: fn('routers/inferences.py', 'create_inference', ['image']),
      meta: { filename: 'sample-7.jpg', declared_mime: 'image/jpeg', bytes: 2_481_152 },
    },
    {
      key: 'validated',
      duration_ms: 1,
      changed: false,
      function: fn('services/validate.py', 'validate_upload', ['data']),
      meta: {
        signature: [0xff, 0xd8, 0xff],
        detected_mime: 'image/jpeg',
        bytes: 2_481_152,
        limit_bytes: 10 * 1024 * 1024,
      },
    },
    {
      key: 'decoded',
      duration_ms: 38,
      changed: true,
      function: fn('preprocess.py', 'decode', ['data']),
      meta: { format: 'JPEG', shape: [4032, 3024, 3], dtype: 'uint8', max_pixels: 50_000_000 },
      image: SIDEWAYS,
    },
    {
      key: 'orientation',
      duration_ms: 9,
      changed: true,
      function: fn('preprocess.py', 'fix_orientation', ['img']),
      meta: { exif_orientation: 6, rotation_degrees: 90, shape: [3024, 4032, 3] },
      image: UPRIGHT,
    },
    {
      key: 'transparency',
      duration_ms: 1,
      changed: false,
      function: fn('preprocess.py', 'flatten_alpha', ['img']),
      meta: { mode: 'RGB', has_alpha: false },
    },
    {
      key: 'grayscale',
      duration_ms: 4,
      changed: true,
      function: fn('preprocess.py', 'to_grayscale', ['img']),
      meta: { shape: [3024, 4032], dtype: 'uint8', range: { min: 18, max: 236 }, mean: 201 },
      image: GRAY,
    },
    {
      key: 'polarity',
      duration_ms: 3,
      changed: true,
      function: fn('preprocess.py', 'normalize_polarity', ['grid']),
      meta: { border_median: 214, flipped: true, range: { min: 19, max: 237 } },
      image: INVERTED,
    },
    {
      key: 'crop',
      duration_ms: 21,
      changed: true,
      function: {
        ...fn('preprocess.py', 'crop_and_center', ['grid']),
        helpers: [fn('preprocess.py', 'otsu_threshold', ['grid'])],
      },
      meta: { input: PHOTO, otsu_cutoff: 97, box: INK_BOX, output_side: 2392 },
    },
    {
      key: 'downsample',
      duration_ms: 2,
      changed: true,
      function: fn('preprocess.py', 'downsample', ['grid', 'size']),
      meta: { block_size: 299, shape: [8, 8], range: { min: 14, max: 231 } },
      grid: toRows(AVERAGED),
    },
    {
      key: 'contrast',
      duration_ms: 1,
      changed: true,
      function: fn('preprocess.py', 'stretch_contrast', ['grid']),
      meta: { before: { min: 14, max: 231 }, after: { min: 0, max: 255 }, shape: [8, 8] },
      grid: toRows(STRETCHED),
    },
    {
      key: 'frame',
      duration_ms: 1,
      changed: true,
      function: fn('services/encoder.py', 'encode_frame', ['grid']),
      meta: {
        sync: SYNC,
        opcode: FRAME_OPCODE,
        length: STRETCHED.length,
        data_bytes: STRETCHED.length,
        checksum: CHECKSUM,
      },
      grid: toRows(STRETCHED),
      bytes: [...PACKET_HEAD, ...STRETCHED, CHECKSUM],
    },
    {
      key: 'result',
      duration_ms: 14,
      changed: true,
      function: fn('services/board.py', 'run', ['grid']),
      meta: {
        source: 'fpga',
        port: 'COM5',
        scores: SCORES,
        digit: WINNER,
        tie: TIE,
        weights: FIXTURE_WEIGHTS,
        weights_source: "scripts/make_weights.py: placeholder templates from Pillow's built-in font",
        weights_sent: false,
        // FRAME 68 + ACK 5 + RUN 4 + RESULT 46 bytes at 86.8 us each.
        wire_ms: 10.677,
      },
      bytes: [...RESULT_HEAD, ...RESULT_BODY, RESULT_CHECKSUM],
    },
  ],
}
