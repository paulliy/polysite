/**
 * The mechanical clack (brief §2): one short filtered noise burst per ripple
 * row, scheduled through WebAudio. Synthesized at runtime — no audio asset
 * to license or load. Gated by the SOUND_ENABLED code constant; there is no
 * visitor-facing sound setting.
 *
 * Browsers keep an AudioContext suspended until a user gesture, so the first
 * board transition (initial page load) is silent; a one-time pointer/key
 * listener resumes the context for everything after that.
 */

import { SOUND_ENABLED } from '@/config'

let ctx: AudioContext | null = null
let noiseBuffer: AudioBuffer | null = null
let unlockRegistered = false

const CLACK_SECONDS = 0.03
const MAX_CLACKS_PER_TRANSITION = 48

function buildNoiseBuffer(context: AudioContext): AudioBuffer {
  const length = Math.ceil(context.sampleRate * CLACK_SECONDS)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < length; i++) {
    // Sharp attack, fast exponential decay.
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (length / 6))
  }
  return buffer
}

function ensureContext(): AudioContext | null {
  if (!SOUND_ENABLED || typeof window === 'undefined' || !('AudioContext' in window)) {
    return null
  }
  ctx ??= new AudioContext()
  noiseBuffer ??= buildNoiseBuffer(ctx)

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

/**
 * Play one clack per distinct delay (i.e. per ripple row), spread over the
 * wave. Delays are deduplicated so a full-board change sounds like a
 * mechanical cascade instead of hundreds of simultaneous hits.
 */
export function scheduleClacks(delaysMs: number[]) {
  const context = ensureContext()
  if (!context || context.state !== 'running' || delaysMs.length === 0) return

  const unique = [...new Set(delaysMs)].sort((a, b) => a - b).slice(0, MAX_CLACKS_PER_TRANSITION)
  const now = context.currentTime
  for (const delay of unique) {
    const source = context.createBufferSource()
    source.buffer = noiseBuffer

    const filter = context.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 2200 + Math.random() * 600
    filter.Q.value = 1.2

    const gain = context.createGain()
    gain.gain.value = 0.12

    source.connect(filter)
    filter.connect(gain)
    gain.connect(context.destination)
    source.start(now + delay / 1000)
  }
}
