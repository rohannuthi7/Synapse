import { describe, expect, it } from 'vitest'
import { PLAYBACK_FIXTURE } from './playbackRun'

const frame = PLAYBACK_FIXTURE.stages.find((s) => s.key === 'frame')!

describe('fixture FRAME packet', () => {
  it('follows rtl/packet.sv: A5, opcode 02, length 40, 64 cells, XOR checksum', () => {
    const bytes = frame.bytes!
    expect(bytes.slice(0, 3)).toEqual([0xa5, 0x02, 0x40])
    expect(bytes).toHaveLength(68)
    expect(bytes.slice(3, 67)).toEqual(frame.grid!.flat())
  })

  it('has a checksum that is the XOR of every byte before it', () => {
    const bytes = frame.bytes!
    const xor = bytes.slice(0, -1).reduce((acc, b) => acc ^ b, 0)
    expect(bytes.at(-1)).toBe(xor)
    expect(frame.meta).toMatchObject({ checksum: xor })
  })
})
