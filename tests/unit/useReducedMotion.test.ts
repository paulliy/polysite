import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReducedMotion } from '@/composables/useReducedMotion'

/** Minimal matchMedia stub driven by a single "reduce" flag. */
function stubMatchMedia(reduce: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reduce : !reduce,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

describe('useReducedMotion', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('is true when the visitor prefers reduced motion', () => {
    stubMatchMedia(true)
    expect(useReducedMotion().value).toBe(true)
  })

  it('is false when there is no reduced-motion preference', () => {
    stubMatchMedia(false)
    expect(useReducedMotion().value).toBe(false)
  })
})
