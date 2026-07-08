import { computed, type ComputedRef } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

/**
 * A direct, synchronous read of the reduced-motion query. VueUse's matchMedia
 * support flag only flips true after mount, so `usePreferredReducedMotion`
 * reports `no-preference` during setup — too late for the first render, which
 * must already skip the loading noise for a reduced-motion visitor. We OR this
 * in so the preference is known before the board's cells first mount.
 */
function prefersReduceNow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Whether the visitor has asked for reduced motion (CLAUDE.md #11). When true,
 * the board skips the flip animation and the loading noise and shows content
 * directly. Reactive: honours a runtime change to the OS/browser setting.
 */
export function useReducedMotion(): ComputedRef<boolean> {
  const preference = usePreferredReducedMotion()
  return computed(() => preference.value === 'reduce' || prefersReduceNow())
}
