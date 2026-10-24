import { useEffect, useRef, useState } from 'react'
import { uploadImage } from '../api/inferences'
import type { InferenceResponse } from '../api/types'
import { failureFromError, failureFromRejection } from '../pipeline/failure'
import type { PipelineFailure } from '../pipeline/failure'
import { loadSampleDigit } from '../pipeline/sampleDigit'
import type { PipelineRun } from '../pipeline/types'
import type { FileRejection } from '../pipeline/upload'

// A union (not separate flags) makes impossible states, like a run with no
// stages, unrepresentable, and lets the page switch exhaustively.
export type RunState =
  | { status: 'idle' }
  | { status: 'uploading'; file: File }
  | { status: 'playing'; run: PipelineRun }
  | { status: 'failed'; failure: PipelineFailure }

export function toPipelineRun(response: InferenceResponse, file: File, preview: string): PipelineRun {
  return { id: response.id, filename: file.name, preview, stages: response.stages }
}

/** Uploads one image to the real backend and holds the stages it returns. */
export function usePipelineRun() {
  const [state, setState] = useState<RunState>({ status: 'idle' })
  // The local preview shown before the backend's first image. Revoked when
  // the run ends so a long session doesn't hold every upload in memory.
  const previewRef = useRef<string | null>(null)

  const releasePreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current)
    previewRef.current = null
  }

  useEffect(() => releasePreview, [])

  const submit = async (file: File) => {
    releasePreview()
    setState({ status: 'uploading', file })
    try {
      const response = await uploadImage(file)
      previewRef.current = URL.createObjectURL(file)
      setState({ status: 'playing', run: toPipelineRun(response, file, previewRef.current) })
    } catch (error) {
      setState({ status: 'failed', failure: failureFromError(error) })
    }
  }

  const submitSample = async () => {
    let file: File
    try {
      file = await loadSampleDigit()
    } catch (error) {
      setState({ status: 'failed', failure: failureFromError(error) })
      return
    }
    await submit(file)
  }

  const reject = (rejection: FileRejection) => {
    releasePreview()
    setState({ status: 'failed', failure: failureFromRejection(rejection) })
  }

  const reset = () => {
    releasePreview()
    setState({ status: 'idle' })
  }

  return { state, submit, submitSample, reject, reset }
}
