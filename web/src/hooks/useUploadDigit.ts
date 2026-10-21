import { useState } from 'react'
import { ApiError } from '../api/client'
import { uploadImage } from '../api/inferences'
import type { InferenceResponse } from '../api/types'

// A union (not separate flags) makes impossible states, like "done" without a
// result, unrepresentable, and lets the UI switch exhaustively.
export type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; file: File }
  | { status: 'done'; file: File; result: InferenceResponse }
  | { status: 'error'; error: ApiError }

export function useUploadDigit() {
  const [state, setState] = useState<UploadState>({ status: 'idle' })

  const submit = async (file: File) => {
    setState({ status: 'uploading', file })
    try {
      const result = await uploadImage(file)
      setState({ status: 'done', file, result })
    } catch (error) {
      setState({
        status: 'error',
        error:
          error instanceof ApiError
            ? error
            : new ApiError('UNKNOWN_ERROR', 'Something went wrong.', 0),
      })
    }
  }

  const reset = () => setState({ status: 'idle' })

  return { state, submit, reset }
}
