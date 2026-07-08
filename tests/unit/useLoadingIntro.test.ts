import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { whenLoadingComplete } from '@/composables/useLoadingIntro'

describe('whenLoadingComplete', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('does not resolve before the minimum duration even if content is instant', async () => {
    let done = false
    void whenLoadingComplete(Promise.resolve(), 1000).then(() => {
      done = true
    })

    await vi.advanceTimersByTimeAsync(999)
    expect(done).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(done).toBe(true)
  })

  it('waits for content when content is slower than the minimum', async () => {
    let releaseContent!: () => void
    const content = new Promise<void>((r) => {
      releaseContent = r
    })
    let done = false
    const settled = whenLoadingComplete(content, 500).then(() => {
      done = true
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(done).toBe(false) // timer done, content still pending

    releaseContent()
    await settled // resolves only once both have settled
    expect(done).toBe(true)
  })
})
