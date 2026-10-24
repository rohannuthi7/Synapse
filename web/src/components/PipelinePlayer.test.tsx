import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PLAYBACK_FIXTURE } from '../pipeline/fixtures/playbackRun'
import PipelinePlayer from './PipelinePlayer'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const GRAYSCALE_AT_MS = 3860 // received → transparency, then into grayscale

function setup() {
  render(<PipelinePlayer run={PLAYBACK_FIXTURE} onUploadAnother={vi.fn()} />)
  const main = screen.getByRole('main')
  const stages = within(screen.getByRole('navigation', { name: 'Pipeline stages' }))
  return { main, stages }
}

describe('PipelinePlayer', () => {
  it('starts on Received with focus on the main region', () => {
    const { main } = setup()
    expect(main).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Received · 2 ms')
  })

  it('shows the Grayscale readout from the run when playback gets there', () => {
    setup()
    act(() => vi.advanceTimersByTime(GRAYSCALE_AT_MS))

    expect(screen.getByRole('status')).toHaveTextContent(
      'Grayscale · 4 msConverting color to one brightness value per pixel.',
    )
    expect(screen.getByText('preprocess.py › to_grayscale(img)')).toBeInTheDocument()
    expect(screen.getByText('18–236')).toBeInTheDocument()
    expect(screen.getByRole('figure').querySelector('figcaption')).toHaveTextContent(
      'Stage 6 of 12, Grayscale. Converting color to one brightness value per pixel.',
    )
    expect(screen.getByText('Playback slowed for viewing. Times shown are real.')).toBeInTheDocument()
  })

  it('shows Crop with its helper function and metadata', () => {
    setup()
    act(() => vi.advanceTimersByTime(6520)) // polarity's hold ends

    expect(screen.getByRole('status')).toHaveTextContent('Crop and center · 21 ms')
    expect(screen.getByText('→ otsu_threshold(grid)')).toBeInTheDocument()
    expect(screen.getByText('704, 744')).toBeInTheDocument()
    expect(screen.getByText('2392 × 2392')).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(30))
    expect(screen.getByText('ink box · 1536 × 2392')).toBeInTheDocument()
  })

  it('offers the values checkbox only on Contrast, without moving what is below', () => {
    setup()
    const toggle = () => screen.getByRole('checkbox', { name: 'Show values (0–255)', hidden: true })
    expect(toggle().closest('label')).toHaveAttribute('data-hidden', 'true')

    act(() => vi.advanceTimersByTime(10_280)) // into Contrast
    expect(screen.getByRole('status')).toHaveTextContent('Contrast · 1 ms')
    expect(toggle().closest('label')).toHaveAttribute('data-hidden', 'false')
    expect(toggle()).toBeChecked()

    const cells = () => screen.getByRole('figure').querySelectorAll('[data-filled] span')
    act(() => vi.advanceTimersByTime(30))
    expect(cells()[2]).toHaveTextContent('18') // 0x12, stretched
    fireEvent.click(toggle())
    expect(cells()[2]).toHaveTextContent('')
  })

  describe('when a real run (no frame encoder yet) finishes', () => {
    const realRun = { ...PLAYBACK_FIXTURE, id: 'real', stages: PLAYBACK_FIXTURE.stages.slice(0, 10) }
    const CONTRAST_DONE_MS = 10_280 + 350

    it('ends on the 8 × 8 grid and says nothing was sent', () => {
      render(<PipelinePlayer run={realRun} onUploadAnother={vi.fn()} />)
      act(() => vi.advanceTimersByTime(CONTRAST_DONE_MS))

      expect(screen.getByRole('status')).toHaveTextContent('8×8 grid · 64 values readyHardware not connected. Frame not sent.')
      expect(screen.getByRole('button', { name: 'Copy values' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Show grid' })).not.toBeInTheDocument()
      expect(screen.getByText(/^Next: an encoder packs these values/)).toBeInTheDocument()
      expect(screen.getByRole('checkbox', { name: 'Show values (0–255)' })).toBeVisible()
    })

    it('copies the 64 values as eight rows', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      render(<PipelinePlayer run={realRun} onUploadAnother={vi.fn()} />)
      act(() => vi.advanceTimersByTime(CONTRAST_DONE_MS))

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy values' })))
      const text = writeText.mock.calls[0][0] as string
      expect(text.split('\n')).toHaveLength(8)
      expect(text.split('\n')[0]).toBe('0 0 18 200 255 224 212 58')
      vi.unstubAllGlobals()
    })
  })

  describe('when a run that ends at Frame finishes', () => {
    const frameRun = { ...PLAYBACK_FIXTURE, id: 'frame', stages: PLAYBACK_FIXTURE.stages.slice(0, 11) }
    const FINISHED_AT_MS = 12_350
    const setupFrame = () => render(<PipelinePlayer run={frameRun} onUploadAnother={vi.fn()} />)

    it('says the frame is ready and plainly that it was not sent', () => {
      setupFrame()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Frame · 68 bytes readyHardware not connected. Frame not sent.',
      )
      expect(screen.queryByRole('group', { name: 'Playback' })).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Upload another' })).toBeInTheDocument()
      expect(screen.getByText('sync · FRAME · length')).toBeInTheDocument()
      expect(screen.getByText('encoder.py › encode_frame(grid)')).toBeInTheDocument()
    })

    it('flips the square to the 8 × 8 grid with values, and back', () => {
      setupFrame()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))
      const figure = screen.getByRole('figure')

      fireEvent.click(screen.getByRole('button', { name: 'Show grid' }))
      expect(figure.querySelector('[data-part]')).toBeNull()
      expect(figure.querySelectorAll('[data-filled] span')[3]).toHaveTextContent('200')
      expect(screen.getByRole('checkbox', { name: 'Show values (0–255)' })).toBeVisible()

      fireEvent.click(screen.getByRole('button', { name: 'Show bytes' }))
      expect(figure.querySelector('[data-part="head"]')).not.toBeNull()
    })

    it('copies the bytes in send order as hex', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      setupFrame()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy bytes' })))
      expect(writeText.mock.calls[0][0]).toMatch(/^A5 02 40 00 00 12 C8 .* 97$/)
      expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
      vi.unstubAllGlobals()
    })

    it('forgets the grid view on replay', () => {
      setupFrame()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))
      fireEvent.click(screen.getByRole('button', { name: 'Show grid' }))
      fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))
      expect(screen.getByRole('button', { name: 'Show grid' })).toHaveAttribute('aria-pressed', 'false')
    })
  })

  describe('when the run finishes on the board result', () => {
    const FINISHED_AT_MS = 14_840

    it('names the prediction, who scored it, and the total time', () => {
      setup()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Predicted 2 · FPGA · COM5 · 14 msScored on the FPGA. Total 97 ms.',
      )
      expect(
        screen.getByText(/^Preprocessing 82 ms · frame 1 ms · board 14 ms, of which 10\.7 ms is bytes on the wire\./),
      ).toBeInTheDocument()
      expect(screen.getByText('board.py › run(grid)')).toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Playback' })).not.toBeInTheDocument()
    })

    it('draws the network with every score, and says them to screen readers', () => {
      setup()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))
      const figure = screen.getByRole('figure')

      expect(figure.querySelector('[data-winner="true"]')).toHaveTextContent('2')
      expect(figure.querySelector('[data-phase="3"]')).not.toBeNull()
      expect(figure.querySelector('figcaption')).toHaveTextContent('Scores: 0 −27,073, 1 −19,404, 2 73,434')
    })

    it('flips to the reply bytes and back', () => {
      setup()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      fireEvent.click(screen.getByRole('button', { name: 'Show reply bytes' }))
      expect(screen.getByText('sync · RESULT · length')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Show network' }))
      expect(screen.queryByText('sync · RESULT · length')).not.toBeInTheDocument()
      const toggle = screen.getByRole('checkbox', { name: 'Show values (0–255)', hidden: true })
      expect(toggle.closest('label')).toHaveAttribute('data-hidden', 'true')
    })

    it('copies the ten scores, the prediction and the reply', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('navigator', { clipboard: { writeText } })
      setup()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copy scores' })))
      const lines = (writeText.mock.calls[0][0] as string).split('\n')
      expect(lines[0]).toBe('0\t-27073')
      expect(lines[10]).toBe('predicted\t2')
      expect(lines[11]).toMatch(/^reply\tA5 83 2A /)
      vi.unstubAllGlobals()
    })

    it('says plainly when the emulator answered instead of the board', () => {
      const stages = PLAYBACK_FIXTURE.stages.map((stage) =>
        stage.key === 'result' ? { ...stage, meta: { ...stage.meta, source: 'emulated' as const, port: null } } : stage,
      )
      render(<PipelinePlayer run={{ ...PLAYBACK_FIXTURE, id: 'emulated', stages }} onUploadAnother={vi.fn()} />)
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))

      expect(screen.getByRole('status')).toHaveTextContent(
        'Predicted 2 · Emulated · 14 msNo board connected: scored by the emulator. Total 97 ms.',
      )
    })

    it('keeps keyboard control when the focused control disappears at the end', () => {
      const { main } = setup()
      screen.getByRole('button', { name: '2×' }).focus()
      act(() => vi.advanceTimersByTime(FINISHED_AT_MS))
      expect(main).toHaveFocus()

      fireEvent.keyDown(main, { key: 'R' })
      expect(screen.getByRole('status')).toHaveTextContent('Received')
    })
  })

  it('fills the stage list as it goes, with real times and notes', () => {
    const { stages } = setup()
    act(() => vi.advanceTimersByTime(GRAYSCALE_AT_MS))

    expect(stages.getByRole('button', { name: /Orientation.*Complete/ })).toHaveTextContent('9 ms · rotated 90°')
    expect(stages.getByRole('button', { name: /Transparency/ })).toHaveTextContent('1 ms · none found')
    expect(stages.getByRole('button', { name: /Grayscale.*Current/ })).toHaveAttribute('aria-current', 'step')
    expect(stages.getByRole('button', { name: /Polarity/ })).toBeDisabled()
  })

  it('jumps back to a finished stage when it is clicked, and pauses', () => {
    const { stages } = setup()
    act(() => vi.advanceTimersByTime(GRAYSCALE_AT_MS))
    fireEvent.click(stages.getByRole('button', { name: /Decoded/ }))

    expect(screen.getByRole('status')).toHaveTextContent('Decoded · 38 ms')
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
    expect(screen.getByText(/^Paused\./)).toBeInTheDocument()
  })

  it('takes keyboard control on the main region', () => {
    const { main } = setup()
    fireEvent.keyDown(main, { key: 'ArrowRight' })
    expect(screen.getByRole('status')).toHaveTextContent('Validated · 1 ms')
    fireEvent.keyDown(main, { key: ' ' })
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument()
  })

  it('switches speed with the segmented buttons', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: '2×' }))
    expect(screen.getByRole('button', { name: '2×' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false')
  })
})
