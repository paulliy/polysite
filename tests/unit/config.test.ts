import { describe, it, expect } from 'vitest'
import {
  FOOTER_ROWS,
  GRID_COLS,
  GRID_ROWS,
  NAV_ROWS,
  MOBILE_GRID_COLS,
  FLIP_HOP_MS,
  FLIP_INTERMEDIATE_TOP_MIN,
  FLIP_INTERMEDIATE_TOP_MAX,
  FLIP_INTERMEDIATE_BOTTOM_MIN,
  FLIP_INTERMEDIATE_BOTTOM_MAX,
  LOADING_MIN_DURATION_MS,
  IMAGE_BLOCK_SIZE,
  FLIP_EASING,
  DEFER_FLIP_MOUNT,
  RIPPLE_DURATION_MS,
  RIPPLE_CURVE,
  CLACK_LENGTH_RATIO,
  CLACK_MIN_SECONDS,
  CLACK_POOL_SIZE,
  CLACK_THROTTLE_MS,
  CLACK_THROTTLE_JITTER_MS,
  CLACK_START_JITTER_MS,
  CLACK_PITCH_JITTER,
  CLACK_FILTER_FREQ_MIN,
  CLACK_FILTER_FREQ_MAX,
  CLACK_FILTER_Q,
  CLACK_BASE_GAIN,
  CLACK_GAIN_JITTER,
  CLACK_MAX_GAIN,
  CLACK_MAX_VOICES,
} from '@/config'
import { RIPPLE_CURVES } from '@/engine/ripple'

describe('config constants', () => {
  it('defines a usable grid', () => {
    expect(GRID_COLS).toBeGreaterThan(0)
    expect(GRID_ROWS).toBeGreaterThan(0)
  })

  it('reserves nav and footer rows but leaves room for content', () => {
    expect(NAV_ROWS).toBeGreaterThan(0)
    expect(FOOTER_ROWS).toBeGreaterThanOrEqual(0)
    expect(NAV_ROWS + FOOTER_ROWS).toBeLessThan(GRID_ROWS)
  })

  it('narrows (never widens) the grid on mobile', () => {
    expect(MOBILE_GRID_COLS).toBeGreaterThan(0)
    expect(MOBILE_GRID_COLS).toBeLessThanOrEqual(GRID_COLS)
  })

  it('keeps timing and pixelation constants sane', () => {
    expect(FLIP_HOP_MS).toBeGreaterThan(0)
    expect(LOADING_MIN_DURATION_MS).toBeGreaterThan(0)
    expect(IMAGE_BLOCK_SIZE).toBeGreaterThanOrEqual(1)
  })

  it('keeps intermediate-flip ranges valid and increasing with depth', () => {
    for (const v of [
      FLIP_INTERMEDIATE_TOP_MIN,
      FLIP_INTERMEDIATE_TOP_MAX,
      FLIP_INTERMEDIATE_BOTTOM_MIN,
      FLIP_INTERMEDIATE_BOTTOM_MAX,
    ]) {
      expect(v).toBeGreaterThanOrEqual(0)
    }
    expect(FLIP_INTERMEDIATE_TOP_MAX).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_TOP_MIN)
    expect(FLIP_INTERMEDIATE_BOTTOM_MAX).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_BOTTOM_MIN)
    // Deeper rows should flap through at least as many intermediates as the top.
    expect(FLIP_INTERMEDIATE_BOTTOM_MIN).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_TOP_MIN)
    expect(FLIP_INTERMEDIATE_BOTTOM_MAX).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_TOP_MAX)
  })

  it('defines a valid CSS easing function and a boolean perf toggle', () => {
    expect(FLIP_EASING).toMatch(/^(cubic-bezier\(.+\)|ease|ease-in|ease-out|ease-in-out|linear)$/)
    expect(typeof DEFER_FLIP_MOUNT).toBe('boolean')
  })

  it('gives the ripple a positive total duration and a recognized curve', () => {
    expect(RIPPLE_DURATION_MS).toBeGreaterThan(0)
    expect(RIPPLE_CURVES).toContain(RIPPLE_CURVE)
  })

  it('keeps clack sound-design constants sane', () => {
    expect(CLACK_LENGTH_RATIO).toBeGreaterThan(0)
    expect(CLACK_MIN_SECONDS).toBeGreaterThan(0)
    expect(CLACK_POOL_SIZE).toBeGreaterThanOrEqual(1)
    expect(CLACK_THROTTLE_MS).toBeGreaterThanOrEqual(0)
    expect(CLACK_THROTTLE_JITTER_MS).toBeGreaterThanOrEqual(0)
    expect(CLACK_START_JITTER_MS).toBeGreaterThanOrEqual(0)
    expect(CLACK_PITCH_JITTER).toBeGreaterThanOrEqual(0)
    expect(CLACK_FILTER_FREQ_MIN).toBeGreaterThan(0)
    expect(CLACK_FILTER_FREQ_MAX).toBeGreaterThan(CLACK_FILTER_FREQ_MIN)
    expect(CLACK_FILTER_Q).toBeGreaterThan(0)
    expect(CLACK_BASE_GAIN).toBeGreaterThan(0)
    expect(CLACK_GAIN_JITTER).toBeGreaterThanOrEqual(0)
    expect(CLACK_MAX_GAIN).toBeGreaterThanOrEqual(CLACK_BASE_GAIN)
    expect(CLACK_MAX_VOICES).toBeGreaterThan(0)
  })
})
