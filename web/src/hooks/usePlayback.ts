import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent } from 'react'
import type { StageTiming } from '../pipeline/motion'
import { PlaybackController } from '../playback/PlaybackController'

// Space on these already means "activate me"; don't also toggle playback.
const SPACE_OWNERS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'LABEL'])

/**
 * Plays one run's stages, starting on mount. Timings are read once: key the
 * component by run so a new run gets a fresh player.
 */
export function usePlayback(timings: readonly StageTiming[], reducedMotion: boolean) {
  const [controller] = useState(() => new PlaybackController(timings, { reducedMotion }))
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    controller.start()
    return controller.dispose
  }, [controller])

  useEffect(() => controller.setReducedMotion(reducedMotion), [controller, reducedMotion])

  /** Attach to the region around the player, not window, so typing elsewhere is unaffected. */
  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return
      const target = event.target as HTMLElement
      switch (event.key) {
        case 'ArrowRight':
          event.preventDefault()
          controller.next()
          break
        case 'ArrowLeft':
          event.preventDefault()
          controller.previous()
          break
        case ' ':
          if (SPACE_OWNERS.has(target.tagName)) return
          event.preventDefault()
          controller.togglePlay()
          break
        case 'r':
        case 'R':
          controller.replay()
          break
      }
    },
    [controller],
  )

  return {
    state,
    onKeyDown,
    play: controller.play,
    pause: controller.pause,
    togglePlay: controller.togglePlay,
    next: controller.next,
    previous: controller.previous,
    jumpTo: controller.jumpTo,
    replay: controller.replay,
    setSpeed: controller.setSpeed,
  }
}
