import type { ErrorBody } from './types'

// Set VITE_API_URL at build time to point a deployed site at its API.
export const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  code: string
  /** HTTP status, or 0 when no response arrived. */
  status: number
  /** The parsed error body exactly as the server sent it, when there was one. */
  body: ErrorBody | null

  constructor(code: string, message: string, status: number, body: ErrorBody | null = null) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.body = body
  }
}

// The only module that calls fetch, so transport quirks are normalized in one
// place and callers only ever see ApiError.
async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(API_BASE_URL + path, init)
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the backend.', 0)
  }

  // fetch only rejects when no response arrives, so HTTP errors must be
  // detected through response.ok.
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? 'Unexpected server error.',
      response.status,
      body?.error ? body : null,
    )
  }
  return (await response.json()) as T
}

export function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  return request<T>(path, { method: 'GET', signal })
}

export function postForm<T>(path: string, form: FormData): Promise<T> {
  // No Content-Type header: the browser must generate the multipart boundary.
  return request<T>(path, { method: 'POST', body: form })
}
