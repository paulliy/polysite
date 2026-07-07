import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollPosition, type UseScrollPositionOptions } from '@/composables/useScrollPosition'

function mountWith(options: UseScrollPositionOptions) {
  const Host = defineComponent({
    setup() {
      useScrollPosition(options)
      return () => h('div')
    },
  })
  return mount(Host)
}

function wheel(deltaY: number) {
  window.dispatchEvent(new WheelEvent('wheel', { deltaY }))
}

function key(k: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true, ...init }))
}

describe('useScrollPosition', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('steps forward once the wheel threshold accumulates', () => {
    const onStep = vi.fn()
    const wrapper = mountWith({ onStep, wheelThreshold: 60 })
    wheel(30)
    expect(onStep).not.toHaveBeenCalled()
    wheel(30)
    expect(onStep).toHaveBeenCalledExactlyOnceWith(1)
    wrapper.unmount()
  })

  it('steps backward for upward wheel movement', () => {
    const onStep = vi.fn()
    const wrapper = mountWith({ onStep, wheelThreshold: 60 })
    wheel(-120)
    expect(onStep).toHaveBeenCalledExactlyOnceWith(-1)
    wrapper.unmount()
  })

  it('collapses a continuous gesture into one step via the cooldown', () => {
    const onStep = vi.fn()
    const wrapper = mountWith({ onStep, wheelThreshold: 60, cooldownMs: 350 })
    wheel(120)
    wheel(120)
    wheel(120)
    expect(onStep).toHaveBeenCalledTimes(1)
    vi.setSystemTime(400)
    wheel(120)
    expect(onStep).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('maps keys to steps and ignores modified keys', () => {
    const onStep = vi.fn()
    const wrapper = mountWith({ onStep, cooldownMs: 0 })
    key('ArrowDown')
    key('ArrowUp')
    key('PageDown')
    key(' ')
    expect(onStep.mock.calls.map((c) => c[0])).toEqual([1, -1, 1, 1])
    key('ArrowDown', { ctrlKey: true })
    expect(onStep).toHaveBeenCalledTimes(4)
    key('x')
    expect(onStep).toHaveBeenCalledTimes(4)
    wrapper.unmount()
  })

  it('stops listening after unmount', () => {
    const onStep = vi.fn()
    const wrapper = mountWith({ onStep })
    wrapper.unmount()
    wheel(500)
    key('ArrowDown')
    expect(onStep).not.toHaveBeenCalled()
  })
})
