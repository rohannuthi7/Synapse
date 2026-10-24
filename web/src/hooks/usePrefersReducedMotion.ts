import { useMediaQuery } from './useMediaQuery'

/** Live value of the visitor's reduced-motion setting. */
export function usePrefersReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)')
}
