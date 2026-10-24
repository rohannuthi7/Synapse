// Mirror api/app/services/validate.py. The backend still enforces both; these
// only spare the visitor a 10 MiB upload that is certain to be rejected.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const

export interface FileRejection {
  file: File
  reason: 'type' | 'size'
}
