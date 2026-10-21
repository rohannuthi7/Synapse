const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export class ApiError extends Error {
  code: string
  status: number

  constructor(code: string, message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string }
}

// The only module that calls fetch, so transport quirks are normalized in one
// place and callers only ever see ApiError.
export async function postForm<T>(path: string, form: FormData): Promise<T> {
  let response: Response
  try {
    // No Content-Type header: the browser must generate the multipart boundary.
    response = await fetch(BASE_URL + path, { method: 'POST', body: form })
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Could not reach the server.', 0)
  }

  // fetch only rejects when no response arrives, so HTTP errors must be
  // detected through response.ok.
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ErrorBody | null
    throw new ApiError(
      body?.error?.code ?? 'UNKNOWN_ERROR',
      body?.error?.message ?? 'Unexpected server error.',
      response.status,
    )
  }
  return (await response.json()) as T
}
