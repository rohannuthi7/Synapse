// Mirrors MAX_UPLOAD_BYTES in api/app/services/validate.py. The server still
// enforces it; checking here spares the visitor uploading a file that is
// certain to be rejected, and the server holding it in memory.
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
// For the file picker only. A wrong type that is dropped is sent anyway, so
// the server's signature check gives the real, recorded answer.
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'] as const

export interface FileRejection {
  file: File
  reason: 'size'
}
