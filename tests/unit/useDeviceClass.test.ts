import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useDeviceClass } from '@/composables/useDeviceClass'

/** Stub matchMedia so '(pointer: coarse)' reports `coarse`. */
function stubPointer(coarse: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('coarse') ? coarse : !coarse,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

/** Override navigator's capability signals for one test. */
function stubNavigator({ cores, memoryGB }: { cores: number; memoryGB?: number }) {
  vi.stubGlobal('navigator', {
    ...navigator,
    hardwareConcurrency: cores,
    deviceMemory: memoryGB,
  })
}

describe('useDeviceClass', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports full for a capable fine-pointer machine', () => {
    stubPointer(false)
    stubNavigator({ cores: 16, memoryGB: undefined })
    expect(useDeviceClass()).toBe('full')
  })

  it('reports low for a weak touch device', () => {
    stubPointer(true)
    stubNavigator({ cores: 4, memoryGB: undefined })
    expect(useDeviceClass()).toBe('low')
  })

  it('reports medium for a mid-range touch device', () => {
    stubPointer(true)
    stubNavigator({ cores: 6, memoryGB: undefined })
    expect(useDeviceClass()).toBe('medium')
  })

  it('honours a low deviceMemory signal when present (Chromium/Android)', () => {
    stubPointer(false)
    stubNavigator({ cores: 8, memoryGB: 2 })
    expect(useDeviceClass()).toBe('low')
  })

  it('does not throttle a coarse-pointer device that lacks a memory signal but has cores', () => {
    // Firefox/iOS report no deviceMemory — must fall back to cores + pointer.
    stubPointer(true)
    stubNavigator({ cores: 8, memoryGB: undefined })
    expect(useDeviceClass()).toBe('full')
  })
})
