import { getJson } from './client'
import type { HealthResponse } from './types'

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return getJson<HealthResponse>('/api/health', signal)
}
