import { ApiError } from '../api/client'

// Served from web/public; regenerate with web/scripts/make_sample_digit.py.
export const SAMPLE_DIGIT_URL = '/sample-digit.png'
export const SAMPLE_DIGIT_NAME = 'sample-digit.png'

/**
 * Loads the bundled sample as a File, so it goes through exactly the same
 * upload path (and the same real backend) as a file the visitor picked.
 */
export async function loadSampleDigit(): Promise<File> {
  let response: Response
  try {
    response = await fetch(SAMPLE_DIGIT_URL)
  } catch {
    throw new ApiError('SAMPLE_UNAVAILABLE', 'Could not load the sample digit.', 0)
  }
  if (!response.ok) {
    throw new ApiError('SAMPLE_UNAVAILABLE', 'Could not load the sample digit.', response.status)
  }
  const blob = await response.blob()
  return new File([blob], SAMPLE_DIGIT_NAME, { type: 'image/png' })
}
