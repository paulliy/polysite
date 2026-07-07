import { describe, it, expect, beforeAll } from 'vitest'

// Captures every scheduled voice so we can inspect timing/pitch/gain.
interface Voice {
  when: number
  rate: number
  gain: number
  freq: number
}
const scheduled: Voice[] = []

class FakeParam {
  value = 0
  constructor(v = 0) {
    this.value = v
  }
}
class FakeContext {
  state = 'running'
  currentTime = 0
  sampleRate = 44100
  destination = {}
  _lastGain = new FakeParam()
  _lastFreq = new FakeParam()
  createBuffer(_ch: number, len: number) {
    return { getChannelData: () => new Float32Array(len) }
  }
  createBufferSource() {
    // Arrow captures the context lexically (no `this` aliasing).
    const record = (when: number, rate: number) =>
      scheduled.push({ when, rate, gain: this._lastGain.value, freq: this._lastFreq.value })
    return {
      playbackRate: new FakeParam(1),
      buffer: null,
      connect() {},
      start(when: number) {
        record(when, this.playbackRate.value)
      },
    }
  }
  createBiquadFilter() {
    this._lastFreq = new FakeParam()
    const freq = this._lastFreq
    return { type: '', frequency: freq, Q: new FakeParam(), connect() {} }
  }
  createGain() {
    this._lastGain = new FakeParam()
    return { gain: this._lastGain, connect() {} }
  }
}

let scheduleClacks: (t: number[]) => void

beforeAll(async () => {
  // @ts-expect-error install fake before the module builds its context
  window.AudioContext = FakeContext
  ;({ scheduleClacks } = await import('@/audio/clack'))
})

function run(impacts: number[]): Voice[] {
  scheduled.length = 0
  scheduleClacks(impacts)
  return [...scheduled].sort((a, b) => a.when - b.when)
}

/** Mirrors board.ts: impact = rowDelay + (hop+1)*100ms. */
function impactsFor(cells: Array<{ row: number; hops: number }>): number[] {
  const out: number[] = []
  for (const { row, hops } of cells) {
    for (let h = 0; h < hops; h++) out.push(row * 18 + (h + 1) * 100)
  }
  return out
}

describe('clack scheduling probe', () => {
  it('single-character change: one soft, in-sync tick per hop', () => {
    const single = run(impactsFor([{ row: 0, hops: 1 }]))
    expect(single).toHaveLength(1)
    // Fires at the landing of the first hop (100ms), ± micro start jitter.
    expect(single[0]!.when).toBeGreaterThan(0.09)
    expect(single[0]!.when).toBeLessThan(0.111)

    const spun = run(impactsFor([{ row: 0, hops: 4 }]))
    expect(spun.length).toBe(4) // a spinning single cell ticks per flap
    const gaps = spun.slice(1).map((v, i) => v.when - spun[i]!.when)
    expect(Math.min(...gaps)).toBeGreaterThan(0.04) // ~100ms apart, not a burst
  })

  it('moderate change: irregular spacing, varied pitch and gain', () => {
    const cells = Array.from({ length: 14 }, (_, i) => ({ row: i % 5, hops: 2 }))
    const voices = run(impactsFor(cells))
    expect(voices.length).toBeGreaterThan(4)

    // Pitch varies per play (no two identical grains at the same rate).
    expect(new Set(voices.map((v) => v.rate.toFixed(4))).size).toBeGreaterThan(1)
    for (const v of voices) expect(Math.abs(v.rate - 1)).toBeLessThanOrEqual(0.09)

    // Gain varies per play — not a deterministic constant.
    expect(new Set(voices.map((v) => v.gain.toFixed(4))).size).toBeGreaterThan(1)

    // Timing is not on a fixed grid: consecutive gaps differ.
    const gaps = voices.slice(1).map((v, i) => +(v.when - voices[i]!.when).toFixed(5))
    expect(new Set(gaps).size).toBeGreaterThan(1)
  })

  it('full-page ripple: throttled, capped, and it clatters then thins', () => {
    // ~22 rows, up to 30 cells/row, 1-5 hops each — hundreds of impacts.
    const cells: Array<{ row: number; hops: number }> = []
    for (let row = 0; row < 22; row++) {
      for (let c = 0; c < 30; c++) cells.push({ row, hops: 1 + ((row + c) % 5) })
    }
    const impacts = impactsFor(cells)
    expect(impacts.length).toBeGreaterThan(1500)

    const voices = run(impacts)
    // Hard voice cap holds.
    expect(voices.length).toBeLessThanOrEqual(48)
    // Throttle enforces a minimum spacing (no machine-gun sub-5ms stacking).
    const gaps = voices.slice(1).map((v, i) => v.when - voices[i]!.when)
    expect(Math.min(...gaps)).toBeGreaterThan(0.004)
    // Density folds into loudness: some clacks are louder than a lone tick,
    // and the level ceiling is respected.
    expect(Math.max(...voices.map((v) => v.gain))).toBeGreaterThan(0.16)
    expect(Math.max(...voices.map((v) => v.gain))).toBeLessThanOrEqual(0.32)
  })
})
