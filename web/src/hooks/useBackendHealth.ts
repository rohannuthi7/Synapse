import { useEffect, useState } from 'react'
import { getHealth } from '../api/health'

/** Long enough to stay quiet in the network panel, short enough to notice an outage. */
export const HEALTH_POLL_MS = 30_000

export type BackendHealth =
  | { status: 'checking' }
  | { status: 'online'; version: string; commit: string }
  | { status: 'offline' }

/** Live answer to "is the API up, and which build is it?" for the footer. */
export function useBackendHealth(pollMs: number = HEALTH_POLL_MS): BackendHealth {
  const [health, setHealth] = useState<BackendHealth>({ status: 'checking' })

  useEffect(() => {
    const controller = new AbortController()

    const check = async () => {
      try {
        const { version, commit } = await getHealth(controller.signal)
        setHealth({ status: 'online', version, commit })
      } catch {
        // An abort means we unmounted; anything else means the API is down.
        if (!controller.signal.aborted) setHealth({ status: 'offline' })
      }
    }

    void check()
    const id = window.setInterval(check, pollMs)
    return () => {
      controller.abort()
      window.clearInterval(id)
    }
  }, [pollMs])

  return health
}
