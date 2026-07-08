import { describe, it, expect } from 'vitest'
import { classifyDevice, timingScaleFor } from '@/engine/deviceClass'

describe('classifyDevice', () => {
  it('classifies a capable desktop (many cores, fine pointer, no memory signal) as full', () => {
    expect(classifyDevice({ cores: 16, memoryGB: undefined, coarsePointer: false })).toBe('full')
    expect(classifyDevice({ cores: 8, memoryGB: 8, coarsePointer: false })).toBe('full')
  })

  it('classifies a weak touch device (few cores + coarse pointer) as low', () => {
    expect(classifyDevice({ cores: 4, memoryGB: undefined, coarsePointer: true })).toBe('low')
    expect(classifyDevice({ cores: 2, memoryGB: undefined, coarsePointer: true })).toBe('low')
  })

  it('classifies a memory-starved device as low regardless of pointer type', () => {
    expect(classifyDevice({ cores: 8, memoryGB: 2, coarsePointer: false })).toBe('low')
    expect(classifyDevice({ cores: 8, memoryGB: 3, coarsePointer: true })).toBe('low')
  })

  it('classifies a mid-range touch device (5-6 cores) as medium', () => {
    expect(classifyDevice({ cores: 6, memoryGB: undefined, coarsePointer: true })).toBe('medium')
    expect(classifyDevice({ cores: 5, memoryGB: undefined, coarsePointer: true })).toBe('medium')
  })

  it('classifies a mid-memory device as medium', () => {
    expect(classifyDevice({ cores: 8, memoryGB: 4, coarsePointer: false })).toBe('medium')
    expect(classifyDevice({ cores: 8, memoryGB: 6, coarsePointer: false })).toBe('medium')
  })

  it('classifies a weak laptop (fine pointer, few cores, no memory signal) as medium', () => {
    expect(classifyDevice({ cores: 4, memoryGB: undefined, coarsePointer: false })).toBe('medium')
    expect(classifyDevice({ cores: 2, memoryGB: undefined, coarsePointer: false })).toBe('medium')
  })

  it('falls back toward full when a missing signal leaves capability ambiguous', () => {
    // Coarse pointer but plenty of cores and no memory signal: not throttled.
    expect(classifyDevice({ cores: 8, memoryGB: undefined, coarsePointer: true })).toBe('full')
  })

  it('lets the strongest (lowest) matching signal win', () => {
    // A high-core touch device that is nonetheless memory-starved → low.
    expect(classifyDevice({ cores: 12, memoryGB: 2, coarsePointer: true })).toBe('low')
  })
})

describe('timingScaleFor', () => {
  it('leaves the full tier at 1.0 across the board (current behavior)', () => {
    expect(timingScaleFor('full')).toEqual({
      loadingConcurrency: 1.0,
      rippleDuration: 1.0,
      intermediateHops: 1.0,
    })
  })

  it('throttles concurrency/hops and lengthens ripple as the tier drops', () => {
    const full = timingScaleFor('full')
    const medium = timingScaleFor('medium')
    const low = timingScaleFor('low')

    expect(low.loadingConcurrency).toBeLessThan(medium.loadingConcurrency)
    expect(medium.loadingConcurrency).toBeLessThan(full.loadingConcurrency)

    expect(low.intermediateHops).toBeLessThan(medium.intermediateHops)
    expect(medium.intermediateHops).toBeLessThan(full.intermediateHops)

    expect(low.rippleDuration).toBeGreaterThan(medium.rippleDuration)
    expect(medium.rippleDuration).toBeGreaterThan(full.rippleDuration)
  })
})
