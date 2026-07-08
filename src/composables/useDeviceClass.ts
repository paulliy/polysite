import { classifyDevice, type DeviceClass } from '@/engine/deviceClass'

/**
 * Read the visitor's device-capability signals and classify them into a tier.
 * Mirrors useReducedMotion.ts's "detect environment synchronously at setup"
 * precedent, but device class doesn't change during a session, so this is a
 * plain synchronous function, not a reactive composable — no watch, no ref.
 * The caller (App.vue) reads it once and stashes the result on the board store,
 * before the first BoardCell mounts and starts the loading noise.
 *
 * `navigator.deviceMemory` is Chromium/Android-only; it's read defensively and
 * left `undefined` on Firefox/iOS, where classifyDevice falls back to the
 * always-present core-count and pointer signals.
 */
export function useDeviceClass(): DeviceClass {
  if (typeof navigator === 'undefined') return 'full'

  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8
  const memoryGB = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
  const coarsePointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches

  return classifyDevice({ cores, memoryGB, coarsePointer })
}
