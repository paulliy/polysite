import { describe, it, expect } from 'vitest'
import { whenAudioReady, primeClack, scheduleClacks } from '@/audio/clack'

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
