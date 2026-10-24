import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const health = { status: 'ok', version: '0.4', commit: '3fa1c2e' }
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
  cells: Array.from({ length: 64 }, () => 0),
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// Routes each URL the page fetches to a canned response, like the real backend.
function stubBackend() {
  const mock = vi.fn<typeof fetch>(async (input) => {
    const url = String(input)
    if (url.endsWith('/api/health')) return json(health)
    if (url.endsWith('/sample-digit.png')) return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
    if (url.endsWith('/api/inferences')) return json(inference, 201)
    throw new Error(`unexpected fetch ${url}`)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

afterEach(() => vi.unstubAllGlobals())

describe('App (empty page)', () => {
  it('renders the header, the 11 stages, the dropzone and the waiting status', async () => {
    stubBackend()
    render(<App />)

    expect(screen.getByRole('heading', { level: 1, name: 'Synapse' })).toBeInTheDocument()
    const repo = screen.getByRole('link', { name: 'Synapse on GitHub (opens in a new tab)' })
    expect(repo).toHaveAttribute('href', 'https://github.com/rohannuthi7/Synapse')
    expect(repo).toHaveAttribute('target', '_blank')

    const stages = within(screen.getByRole('navigation', { name: 'Pipeline stages' }))
    expect(stages.getAllByRole('listitem')).toHaveLength(11)
    stages.getAllByRole('button').forEach((button) => expect(button).toBeDisabled())

    expect(screen.getByText('Drag a PNG or JPEG here')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for an image')
    expect(await screen.findByText('API v0.4 · commit 3fa1c2e · Backend online')).toBeInTheDocument()
  })

  it('sends the sample digit to the real upload endpoint', async () => {
    const mock = stubBackend()
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: 'Try a sample digit' }))

    expect(await screen.findByText('Upload accepted')).toBeInTheDocument()
    const upload = mock.mock.calls.find(([url]) => String(url).endsWith('/api/inferences'))
    const sent = upload?.[1]?.body as FormData
    expect((sent.get('image') as File).name).toBe('sample-digit.png')
  })
})
