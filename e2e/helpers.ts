import { expect, type Page } from '@playwright/test'

/**
 * The loading intro now holds on the noise until the visitor's first gesture
 * ("CLICK TO START"), so tests must start it explicitly. A corner click reveals
 * without hitting a link (and follow() is guarded during loading anyway).
 */
export async function start(page: Page) {
  await page.mouse.click(4, 4)
}

/** Wait for every in-flight flip to finish (loading reveal or a transition). */
export async function settle(page: Page, timeout = 10_000) {
  await expect(page.locator('.flip')).toHaveCount(0, { timeout })
}

type DeviceTier = 'full' | 'medium' | 'low'

/**
 * Force the app to detect a given device tier. Playwright's mobile-emulation
 * "devices" only spoof viewport/UA/touch — `navigator.hardwareConcurrency` and
 * `deviceMemory` still reflect the real host machine — so tier coverage needs
 * an explicit override. This redefines those signals and makes
 * `matchMedia('(pointer: coarse)')` report what each tier's classifier needs.
 * Must be called BEFORE `page.goto` (addInitScript runs at document start),
 * same spirit as a11y.spec.ts's belt-and-suspenders reduced-motion override.
 */
export async function forceDeviceClass(page: Page, tier: DeviceTier) {
  // Signals chosen to land squarely in each tier per engine/deviceClass.ts:
  //   low    → coarse pointer, 2 cores, 2 GB
  //   medium → coarse pointer, 6 cores, no memory signal
  //   full   → fine pointer,  16 cores, no memory signal
  const profile = {
    low: { cores: 2, memoryGB: 2 as number | undefined, coarse: true },
    medium: { cores: 6, memoryGB: undefined as number | undefined, coarse: true },
    full: { cores: 16, memoryGB: undefined as number | undefined, coarse: false },
  }[tier]

  await page.addInitScript(
    ({ cores, memoryGB, coarse }) => {
      Object.defineProperty(navigator, 'hardwareConcurrency', { value: cores, configurable: true })
      if (memoryGB === undefined) {
        // Emulate Firefox/iOS: the API is simply absent.
        Reflect.deleteProperty(navigator as object, 'deviceMemory')
      } else {
        Object.defineProperty(navigator, 'deviceMemory', { value: memoryGB, configurable: true })
      }
      const realMatchMedia = window.matchMedia.bind(window)
      window.matchMedia = ((query: string) => {
        if (query.includes('pointer: coarse')) {
          return {
            matches: coarse,
            media: query,
            onchange: null,
            addEventListener() {},
            removeEventListener() {},
            addListener() {},
            removeListener() {},
            dispatchEvent() {
              return false
            },
          } as unknown as MediaQueryList
        }
        return realMatchMedia(query)
      }) as typeof window.matchMedia
    },
    profile,
  )
}
