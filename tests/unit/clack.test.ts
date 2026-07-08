import { describe, it, expect } from 'vitest'
import { whenAudioReady, primeClack, scheduleClacks, foldImpacts } from '@/audio/clack'

describe('foldImpacts', () => {
  // Deterministic: zero jitter → gap is exactly the throttle.
  const fold = (times: number[], throttle = 20) => foldImpacts(times, throttle, 0, () => 0.5)

  it('folds impacts within the throttle window into one weighted clack', () => {
    expect(fold([0, 5, 10])).toEqual([{ time: 0, weight: 3 }])
  })

  it('keeps impacts separated by at least the throttle as distinct clacks', () => {
    expect(fold([0, 25, 50])).toEqual([
      { time: 0, weight: 1 },
      { time: 25, weight: 1 },
      { time: 50, weight: 1 },
    ])
  })

  it('sorts unordered impacts before folding', () => {
    expect(fold([50, 0, 25])).toEqual([
      { time: 0, weight: 1 },
      { time: 25, weight: 1 },
      { time: 50, weight: 1 },
    ])
  })

  it('measures the gap from the last PLAYED clack, not the last impact', () => {
    // 0 plays; 15 folds (within 20 of 0); 30 is 30 from 0 (the last played) → plays.
    expect(fold([0, 15, 30])).toEqual([
      { time: 0, weight: 2 },
      { time: 30, weight: 1 },
    ])
  })

  it('returns nothing for no impacts', () => {
    expect(fold([])).toEqual([])
  })
})

// jsdom has no WebAudio, so these exercise the graceful-degradation paths that
// must never block the loading reveal or throw when audio is unavailable.
describe('clack audio (no WebAudio in jsdom)', () => {
  it('whenAudioReady resolves immediately, never blocking the reveal', async () => {
    const race = await Promise.race([
      whenAudioReady(10_000).then(() => 'ready'),
      new Promise((r) => setTimeout(() => r('blocked'), 50)),
    ])
    expect(race).toBe('ready')
  })

  it('primeClack and scheduleClacks are safe no-ops without an AudioContext', () => {
    expect(() => primeClack()).not.toThrow()
    expect(() => scheduleClacks([0, 100, 200])).not.toThrow()
  })
})
