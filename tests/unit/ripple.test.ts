import { describe, it, expect } from 'vitest'
import { rippleDelayMs, RIPPLE_CURVES } from '@/engine/ripple'

describe('rippleDelayMs', () => {
  it('starts at 0 and ends at the full duration for every curve', () => {
    for (const curve of RIPPLE_CURVES) {
      expect(rippleDelayMs(0, 400, curve)).toBe(0)
      expect(rippleDelayMs(1, 400, curve)).toBe(400)
    }
  })

  it('spaces linear delays evenly', () => {
    expect(rippleDelayMs(0.5, 400, 'linear')).toBe(200)
  })

  it('ease-in starts slower than linear, ease-out starts faster', () => {
    const linear = rippleDelayMs(0.25, 400, 'linear')
    expect(rippleDelayMs(0.25, 400, 'ease-in')).toBeLessThan(linear)
    expect(rippleDelayMs(0.25, 400, 'ease-out')).toBeGreaterThan(linear)
  })

  it('clamps row fractions outside [0, 1]', () => {
    expect(rippleDelayMs(-1, 400, 'linear')).toBe(0)
    expect(rippleDelayMs(2, 400, 'linear')).toBe(400)
  })
})
