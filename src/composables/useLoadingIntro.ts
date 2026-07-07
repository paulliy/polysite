import { LOADING_MIN_DURATION_MS } from '@/config'

/**
 * The loading-intro gate (brief §2, CLAUDE.md #9): the noise state must run for
 * a fixed minimum duration *regardless* of how fast content loads, so it always
 * reads as intentional. This resolves only once BOTH the minimum-duration timer
 * and the content-ready promise have settled — the
 * `Promise.all([minDurationTimer, contentReadyPromise])` from the brief.
 *
 * Pure and side-effect-light so it can be unit-tested with fake timers; the
 * caller flips the board's `loading` flag when the returned promise resolves.
 */
export function whenLoadingComplete(
  contentReady: Promise<unknown>,
  minDurationMs: number = LOADING_MIN_DURATION_MS,
): Promise<void> {
  const minDuration = new Promise<void>((resolve) => {
    setTimeout(resolve, minDurationMs)
  })
  return Promise.all([minDuration, contentReady]).then(() => undefined)
}
