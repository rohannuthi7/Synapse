// These mirror api/app/schemas.py and docs/api.md, and must change together
// with them. A UUID arrives over JSON as a plain string.
export interface UploadInfo {
  filename: string | null
  declared_mime: string | null
  detected_mime: string
  bytes: number
}

export interface InferenceResponse {
  id: string
  upload: UploadInfo
}
