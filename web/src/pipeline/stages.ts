// The backend's stages, preprocessing through the board's answer, in the
// order they run and are shown.
// Keys are what the API will send per stage; labels are the on-screen names.
export const PIPELINE_STAGES = [
  { key: 'received', label: 'Received' },
  { key: 'validated', label: 'Validated' },
  { key: 'decoded', label: 'Decoded' },
  { key: 'orientation', label: 'Orientation' },
  { key: 'transparency', label: 'Transparency' },
  { key: 'grayscale', label: 'Grayscale' },
  { key: 'polarity', label: 'Polarity' },
  { key: 'crop', label: 'Crop and center' },
  { key: 'downsample', label: 'Downsample' },
  { key: 'contrast', label: 'Contrast' },
  { key: 'frame', label: 'Frame' },
  { key: 'result', label: 'Result' },
] as const

export type StageKey = (typeof PIPELINE_STAGES)[number]['key']
