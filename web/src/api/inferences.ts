import { postForm } from './client'
import type { InferenceResponse } from './types'

export function uploadImage(file: File): Promise<InferenceResponse> {
  const form = new FormData()
  // Must match the FastAPI parameter name (`image`) in routers/inferences.py.
  form.append('image', file)
  return postForm<InferenceResponse>('/api/inferences', form)
}
