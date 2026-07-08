import { computed, type ComputedRef } from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'

/**
 * Whether the visitor has asked for reduced motion (CLAUDE.md #11). When true,
 * the board skips the flip animation and the loading noise and shows content
 * directly. Reactive: honours a runtime change to the OS/browser setting.
 */
export function useReducedMotion(): ComputedRef<boolean> {
  const preference = usePreferredReducedMotion()
  return computed(() => preference.value === 'reduce')
}
