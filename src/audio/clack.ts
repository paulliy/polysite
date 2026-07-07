/**
 * The mechanical clack (brief §2): short filtered noise transients scheduled
 * through WebAudio, one per flap hop, fired at the moment the flap lands.
 * Synthesized at runtime — no audio asset to license or load. Gated by the
 * SOUND_ENABLED code constant; there is no visitor-facing sound setting.
 *
 * Designed to read as a natural clatter rather than a machine gun:
 *  - the clack's length tracks FLIP_HOP_MS, so it resolves as the flap lands
 *    and stays in sync if that constant changes;
 *  - every play draws from a small pool of noise grains with random pitch,
 *    gain, and filter jitter, so no two ticks are identical;
 *  - trigger times are throttled with a jittered minimum gap (dense impacts
 *    fold together and get a touch louder), breaking the periodicity that
 *    makes even spacing sound mechanical.
 *
 * Browsers keep an AudioContext suspended until a user gesture, so the first
 * board transition (initial page load) is silent; a one-time pointer/key
 * listener resumes the context for everything after that.
 */

import {
  FLIP_HOP_MS,
  SOUND_ENABLED,
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

let ctx: AudioContext | null = null
let noisePool: AudioBuffer[] = []
let unlockRegistered = false

/** Clack length tracks the hop so the tick resolves as the flap lands. */
const CLACK_SECONDS = Math.max(CLACK_MIN_SECONDS, (FLIP_HOP_MS / 1000) * CLACK_LENGTH_RATIO)

function buildNoiseGrain(context: AudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * CLACK_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  const attack = Math.max(1, Math.floor(context.sampleRate * 0.001))
  for (let i = 0; i < length; i++) {
    // Sharp attack, fast exponential decay that resolves well before the end.
    const env = Math.min(1, i / attack) * Math.exp(-i / (length * 0.15))
    data[i] = (Math.random() * 2 - 1) * env
  }
  return buffer
}

function ensureContext(): AudioContext | null {
  if (!SOUND_ENABLED || typeof window === 'undefined' || !('AudioContext' in window)) {
    return null
  }
  ctx ??= new AudioContext()
  if (noisePool.length === 0) {
    noisePool = Array.from({ length: CLACK_POOL_SIZE }, () => buildNoiseGrain(ctx!))
  }

  if (ctx.state === 'suspended' && !unlockRegistered) {
    unlockRegistered = true
    const unlock = () => {
      void ctx?.resume()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
  }
  return ctx
}

function rand(): number {
  return Math.random()
}

/** Schedule one filtered noise transient at `whenMs` (relative to now). */
function playClack(context: AudioContext, now: number, whenMs: number, weight: number) {
  const grain = noisePool[Math.floor(rand() * noisePool.length)]
  if (!grain) return

  const source = context.createBufferSource()
  source.buffer = grain
  // Pitch jitter — also nudges length slightly, which is fine.
  source.playbackRate.value = 1 + (rand() - 0.5) * CLACK_PITCH_JITTER

  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value =
    CLACK_FILTER_FREQ_MIN + rand() * (CLACK_FILTER_FREQ_MAX - CLACK_FILTER_FREQ_MIN)
  filter.Q.value = CLACK_FILTER_Q

  const gain = context.createGain()
  // Per-play level jitter, plus a gentle rise with how many impacts folded in.
  const base = CLACK_BASE_GAIN * (1 - CLACK_GAIN_JITTER / 2 + rand() * CLACK_GAIN_JITTER)
  gain.gain.value = Math.min(CLACK_MAX_GAIN, base * Math.sqrt(weight))

  source.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  source.start(now + Math.max(0, whenMs) / 1000)
}

/**
 * Play the clack track for a transition. Each entry in `impactTimesMs` is the
 * landing time of one flap hop of one cell. Impacts closer than a jittered
 * minimum gap fold into the previous clack (making it a touch louder), so a
 * dense ripple thins into a natural, irregular clatter instead of a burst of
 * evenly-spaced identical hits.
 */
export function scheduleClacks(impactTimesMs: number[]) {
  const context = ensureContext()
  if (!context || context.state !== 'running' || impactTimesMs.length === 0) return

  const sorted = [...impactTimesMs].sort((a, b) => a - b)
  const events: Array<{ time: number; weight: number }> = []
  let lastPlayed = -Infinity
  for (const time of sorted) {
    const gap = CLACK_THROTTLE_MS + (rand() - 0.5) * CLACK_THROTTLE_JITTER_MS
    if (time - lastPlayed < gap) {
      const last = events[events.length - 1]
      if (last) last.weight++
      continue
    }
    events.push({ time, weight: 1 })
    lastPlayed = time
  }

  const now = context.currentTime
  for (const { time, weight } of events.slice(0, CLACK_MAX_VOICES)) {
    playClack(context, now, time + (rand() - 0.5) * CLACK_START_JITTER_MS, weight)
  }
}
