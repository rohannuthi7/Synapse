import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { PLAYBACK_FIXTURE } from './pipeline/fixtures/playbackRun'

const health = { status: 'ok', version: '0.5', commit: '3fa1c2e' }
// The real backend's stages: received through contrast, no frame encoder yet.
const stages = PLAYBACK_FIXTURE.stages.slice(0, 10)
const inference = {
  id: '3f6c2c1e-8a0b-4d57-9a43-5d1f0e7b9c21',
  upload: {
    filename: 'sample-digit.png',
    declared_mime: 'image/png',
    detected_mime: 'image/png',
    bytes: 59153,
    width: 640,
    height: 640,
    format: 'PNG',
  },
  stages,
}
const cropFailure = {
  error: {
    code: 'NO_DIGIT_FOUND',
    message: 'Ink is not clearly brighter than the paper.',
    stage: 'crop',
    function: { file: 'services/preprocess.py', name: 'crop_digit', params: ['grid'] },
    detail: 'Ink mean 61, paper mean 22, gap 39 (needs 50).',
  },
  stages: stages.slice(0, 7),
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// Routes each URL the page fetches to a canned response, like the real backend.
function stubBackend(upload: () => Response | Promise<Response> = () => json(inference, 201)) {
  const mock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/health')) return json(health)
    if (url.endsWith('/sample-digit.png')) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    if (url.endsWith('/api/inferences')) return upload()
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => {} }))
})
afterEach(() => vi.unstubAllGlobals())

async function trySample() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Try a sample digit' }))
  })
}

describe('App', () => {
  it('renders the header, the 11 stages, the dropzone and the waiting status', async () => {
    stubBackend()
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Synapse' })).toBeInTheDocument()
    const repo = screen.getByRole('link', { name: 'Synapse on GitHub (opens in a new tab)' })
    expect(repo).toHaveAttribute('href', 'https://github.com/rohannuthi7/Synapse')
    expect(repo).toHaveAttribute('target', '_blank')

    const list = within(screen.getByRole('navigation', { name: 'Pipeline stages' }))
    expect(list.getAllByRole('listitem')).toHaveLength(11)
    list.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())

    expect(screen.getByText('Drag a PNG or JPEG here')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an image')
    expect(await screen.findByText('API v0.5 · commit 3fa1c2e · Backend online')).toBeInTheDocument()
  })

  it('plays the stages the backend returns for the sample digit', async () => {
    const mock = stubBackend()
    render(<App />)
    await trySample()

    expect(await screen.findByRole('button', { name: /Received.*Current/ })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Received · 2 ms')
    const upload = mock.mock.calls.find(([url]) => String(url).endsWith('/api/inferences'))
    expect(((upload?.[1]?.body as FormData).get('image') as File).name).toBe('sample-digit.png')

    const list = within(screen.getByRole('navigation', { name: 'Pipeline stages' }))
    expect(list.getByRole('button', { name: /Frame.*Planned, not built yet/ })).toBeDisabled()
  })

  it('replaces the page with the error view when a stage fails', async () => {
    stubBackend(() => json(cropFailure, 400))
    render(<App />)
    await trySample()

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Pipeline stopped at stage 8 of 11: Crop and center',
    )
    expect(screen.queryByRole('navigation', { name: 'Pipeline stages' })).not.toBeInTheDocument()
    expect(screen.getByText('services/preprocess.py › crop_digit(grid)')).toBeInTheDocument()
    expect(screen.getByText('NO_DIGIT_FOUND')).toBeInTheDocument()
    expect(screen.getByText('(HTTP 400)')).toBeInTheDocument()
    expect(screen.getByText('Ink mean 61, paper mean 22, gap 39 (needs 50).')).toBeInTheDocument()

    const track = within(screen.getByRole('list', { name: 'Where the run stopped' }))
    expect(track.getAllByRole('listitem')[7]).toHaveTextContent('Crop and centerFailed')
    expect(track.getAllByRole('listitem')[3]).toHaveTextContent('9 ms · rotated 90°')
    expect(track.getAllByRole('listitem')[8]).toHaveTextContent('Not run')
  })

  it('shows the raw response JSON on request', async () => {
    stubBackend(() => json(cropFailure, 400))
    render(<App />)
    await trySample()

    const toggle = await screen.findByRole('button', { name: 'Show response JSON' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(screen.getByRole('button', { name: 'Hide response JSON' })).toHaveAttribute('aria-expanded', 'true')
    expect(document.getElementById('error-response-json')).toHaveTextContent('"code": "NO_DIGIT_FOUND"')
  })

  it('says plainly when the backend could not be reached, with no stage marked', async () => {
    stubBackend(() => Promise.reject(new TypeError('Failed to fetch')))
    render(<App />)
    await trySample()

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the backend')
    expect(screen.getByText(/^POST .*\/api\/inferences$/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Show response JSON' })).not.toBeInTheDocument()
    const track = within(screen.getByRole('list', { name: 'Where the run stopped' }))
    track.getAllByRole('listitem').forEach((item) => expect(item).toHaveTextContent('Not run'))
  })

  it('goes back to the empty page from the error view', async () => {
    stubBackend(() => json(cropFailure, 400))
    render(<App />)
    await trySample()

    fireEvent.click(await screen.findByRole('button', { name: 'Upload another image' }))
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an image')
  })
})

describe('App response JSON', () => {
  it('shortens stage image data URLs so the JSON stays readable', async () => {
    const withImage = {
      ...cropFailure,
      stages: [{ ...stages[2], image: `data:image/jpeg;base64,${'A'.repeat(20_000)}` }],
    }
    stubBackend(() => json(withImage, 400))
    render(<App />)
    await trySample()
    fireEvent.click(await screen.findByRole('button', { name: 'Show response JSON' }))
    const block = document.getElementById('error-response-json')!
    expect(block).toHaveTextContent(/"image": "data:image\/jpeg;base64,A+… \(19\.6 KB\)"/)
    expect(block).toHaveTextContent('Image data URLs are shortened here')
  })
})
