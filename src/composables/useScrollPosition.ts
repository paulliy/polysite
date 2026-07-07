import { useEventListener } from '@vueuse/core'

/**
 * Wheel / touch / keyboard → frame-advance events (brief §6). There is no
 * native scroll anywhere; input gestures step a virtual position by whole
 * frames. A short cooldown turns a continuous wheel/trackpad gesture into
 * one step instead of a burst.
 */

export interface UseScrollPositionOptions {
  onStep: (delta: 1 | -1) => void
  /** Accumulated wheel deltaY required to trigger a step. */
  wheelThreshold?: number
  /** Minimum time between steps. */
  cooldownMs?: number
  /** Minimum touch travel (px) to count as a swipe. */
  swipeThreshold?: number
}

const KEY_DELTAS: Record<string, 1 | -1> = {
  ArrowDown: 1,
  PageDown: 1,
  ' ': 1,
  ArrowUp: -1,
  PageUp: -1,
}

export function useScrollPosition(options: UseScrollPositionOptions) {
  const { onStep, wheelThreshold = 60, cooldownMs = 350, swipeThreshold = 40 } = options

  let accumulated = 0
  let lockedUntil = 0
  let touchStartY: number | null = null

  function step(delta: 1 | -1) {
    const now = Date.now()
    if (now < lockedUntil) return
    lockedUntil = now + cooldownMs
    accumulated = 0
    onStep(delta)
  }

  useEventListener(window, 'wheel', (event: WheelEvent) => {
    accumulated += event.deltaY
    if (accumulated >= wheelThreshold) step(1)
    else if (accumulated <= -wheelThreshold) step(-1)
  })

  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const delta = KEY_DELTAS[event.key]
    if (delta === undefined) return
    event.preventDefault()
    step(delta)
  })

  useEventListener(window, 'touchstart', (event: TouchEvent) => {
    touchStartY = event.touches[0]?.clientY ?? null
  })

  useEventListener(window, 'touchend', (event: TouchEvent) => {
    if (touchStartY === null) return
    const endY = event.changedTouches[0]?.clientY
    if (endY === undefined) return
    const travel = touchStartY - endY
    touchStartY = null
    if (Math.abs(travel) < swipeThreshold) return
    step(travel > 0 ? 1 : -1) // swipe up → next frame
  })
}
