import type { StageKey } from '../pipeline/stages'
import type { FunctionRef, Stage } from '../pipeline/types'

// These mirror api/app/schemas.py and must change together with it. A UUID
// arrives over JSON as a plain string.
export interface UploadInfo {
  filename: string | null
  declared_mime: string | null
  detected_mime: string
  bytes: number
  width: number
  height: number
  format: string
}

/** POST /api/inferences: every stage the pipeline ran, in order. */
export interface InferenceResponse {
  id: string
  upload: UploadInfo
  stages: Stage[]
}

/** Every error response: `{error: {...}}`, plus the stages that finished first. */
export interface ErrorBody {
  error: {
    code: string
    message: string
    /** The stage that failed; absent for errors outside the pipeline. */
    stage?: StageKey
    function?: FunctionRef
    /** Measured facts behind the message, when the check has any. */
    detail?: string
  }
  stages?: Stage[]
}

export interface HealthResponse {
  status: 'ok'
  version: string
  /** Git commit of the running build, or "unknown". */
  commit: string
}
