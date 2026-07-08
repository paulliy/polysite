/**
 * Device-class tiering (see docs/split-flap-site-brief.md perf notes). Maps a
 * few coarse capability signals to one of three tiers, which the board uses to
 * scale — never change the character of — its heaviest animation work: the
 * loading-noise concurrency and the ripple/flip timing. Plain, framework-
 * agnostic TypeScript — no Vue, no `navigator` access here (the composable
 * gathers the signals; this module only classifies them), so it's trivially
 * unit-testable in isolation. Mirrors engine/ripple.ts's style.
 */

import {
  DEVICE_CLASS_LOW_CORES,
  DEVICE_CLASS_MEDIUM_CORES,
  DEVICE_CLASS_LOW_MEMORY_GB,
  DEVICE_CLASS_MEDIUM_MEMORY_GB,
  DEVICE_CLASS_LAPTOP_CORES,
  DEVICE_TIMING_SCALE,
} from '@/config'

export type DeviceClass = 'full' | 'medium' | 'low'

/** How much each tier scales the board's animation work. */
export interface TimingScale {
  /** Multiplier on LOADING_MAX_CONCURRENT — fewer cells mid-hop at once. */
  loadingConcurrency: number
  /** Multiplier on RIPPLE_DURATION_MS — a gentler, cheaper stagger. */
  rippleDuration: number
  /** Multiplier on the intermediate-hop count — fewer flaps per flip. */
  intermediateHops: number
}

export type { TimingScale as DeviceTimingScale }

/** The raw capability signals a runtime gathers for classification. */
export interface DeviceSignals {
  /** navigator.hardwareConcurrency (logical cores). Universally available. */
  cores: number
  /**
   * navigator.deviceMemory in GB. `undefined` on Firefox and every iOS
   * browser (Chrome-on-iOS is WebKit) — must never be a *required* signal.
   */
  memoryGB: number | undefined
  /** matchMedia('(pointer: coarse)').matches — the universal touch signal. */
  coarsePointer: boolean
}

/**
 * Classify a device into a tier. Checked low → medium → full, first match
 * wins; unknown signals fall back *toward* `full` rather than assuming
 * weakness, so a capable device with a missing signal is never needlessly
 * throttled. `full` reproduces today's exact numbers (scale 1.0).
 */
export function classifyDevice({ cores, memoryGB, coarsePointer }: DeviceSignals): DeviceClass {
  const lowMemory = memoryGB !== undefined && memoryGB <= DEVICE_CLASS_LOW_MEMORY_GB
  const mediumMemory = memoryGB !== undefined && memoryGB <= DEVICE_CLASS_MEDIUM_MEMORY_GB

  // low: a touch device with few cores, or an explicitly memory-starved device.
  if ((coarsePointer && cores <= DEVICE_CLASS_LOW_CORES) || lowMemory) {
    return 'low'
  }

  // medium: a mid-range phone/tablet, a mid-memory device, or a weak laptop
  // (fine pointer but few cores).
  if (
    (coarsePointer && cores <= DEVICE_CLASS_MEDIUM_CORES) ||
    mediumMemory ||
    (!coarsePointer && cores <= DEVICE_CLASS_LAPTOP_CORES)
  ) {
    return 'medium'
  }

  return 'full'
}

/** The timing scale for a tier. */
export function timingScaleFor(deviceClass: DeviceClass): TimingScale {
  return DEVICE_TIMING_SCALE[deviceClass]
}
