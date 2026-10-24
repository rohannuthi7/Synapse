import { useSyncExternalStore } from 'react'

/** Below Carbon's md breakpoint (672px), where the layout goes single-column. */
export const NARROW_SCREEN = '(max-width: 671.98px)'

// matchMedia is missing in some test environments; treat that as "no match".
const media = (query: string) =>
  typeof window.matchMedia === 'function' ? window.matchMedia(query) : null

/** Live value of a CSS media query, for the few layout choices CSS alone can't make. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = media(query)
      list?.addEventListener('change', onChange)
      return () => list?.removeEventListener('change', onChange)
    },
    () => media(query)?.matches ?? false,
  )
}
