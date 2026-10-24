import { ApiError } from '../api/client'
import type { ErrorBody } from '../api/types'
import type { StageKey } from './stages'
import type { FileRejection } from './upload'
import { MAX_UPLOAD_BYTES } from './upload'
import type { FunctionRef, Stage } from './types'

/** Everything the error view shows about a run that stopped. */
export interface PipelineFailure {
  /** Who noticed: the API, this browser before uploading, or nobody (no response). */
  origin: 'server' | 'browser' | 'network'
  code: string
  message: string
  /** Where the run stopped; absent when it never reached a stage. */
  stage?: StageKey
  fn?: FunctionRef
  detail?: string
  /** HTTP status, when a response came back. */
  httpStatus?: number
  /** Stages that finished before the failure, with their real times. */
  completed: Stage[]
  /** The response body exactly as received, for "Show response JSON". */
  response?: ErrorBody
}

export function failureFromError(error: unknown): PipelineFailure {
  if (!(error instanceof ApiError)) {
    return { origin: 'browser', code: 'UNKNOWN_ERROR', message: 'Something went wrong in the page.', completed: [] }
  }
  if (error.status === 0) {
    return { origin: 'network', code: error.code, message: error.message, completed: [] }
  }
  const body = error.body
  return {
    origin: 'server',
    code: error.code,
    message: error.message,
    stage: body?.error.stage,
    fn: body?.error.function,
    detail: body?.error.detail,
    httpStatus: error.status,
    completed: body?.stages ?? [],
    response: body ?? undefined,
  }
}

/**
 * A file over the limit is stopped here rather than uploaded, so the server
 * never sees it. It is reported as a Validated failure, with the same code
 * and wording services/validate.py would use, and says it was checked here.
 */
export function failureFromRejection({ file }: FileRejection): PipelineFailure {
  return {
    origin: 'browser',
    code: 'FILE_TOO_LARGE',
    message: `File is ${file.size} bytes; limit is ${MAX_UPLOAD_BYTES}.`,
    stage: 'validated',
    completed: [],
  }
}
