import { test, expect } from '@playwright/test'
import { settle, start, forceDeviceClass } from './helpers'

/**
 * Sample the *average* number of cells mid-hop at once over a window of the
 * intro. Every cell mounts `.flip` for the whole intro (so counting elements
 * measures mounting, not concurrency); the live signal is the count of running
 * WAAPI animations, which each cell cancels between hops — so this tracks the
 * concurrency the device tier actually scales. The mean (not the instantaneous
 * peak) is used because it's robust to the sampler missing a spike under the
 * CPU contention of a parallel test run.
 */
async function averageConcurrency(page: import('@playwright/test').Page, windowMs = 2500) {
  const samples: number[] = []
  const deadline = Date.now() + windowMs
  while (Date.now() < deadline) {
    samples.push(
      await page.evaluate(
        () => document.getAnimations().filter((a) => a.playState === 'running').length,
      ),
    )
    await page.waitForTimeout(30)
  }
  return samples.reduce((a, b) => a + b, 0) / Math.max(1, samples.length)
}

test('holds on the loading noise until a gesture, then settles into content', async ({
  page,
}) => {
  await page.goto('/')

  // During the intro every cell animates its own noise → many `.flip` elements
  // are mounted at once (idle cells never mount `.flip`).
  await expect(async () => {
    expect(await page.locator('.flip').count()).toBeGreaterThan(100)
  }).toPass({ timeout: 3000 })

  // The board only reveals on a click or key press.
  await start(page)

  // Once started, the whole board settles: no `.flip` elements remain and the
  // nav shows its real, settled content. (The "POLYSITE" title is dropped on the
  // narrow mobile grid, so assert on the menu, which is present in every layout.)
  await settle(page)
  await expect(page.locator('.nav')).toContainText('Projects')
})

test('a low device tier throttles the loading-noise concurrency', async ({ page }) => {
  // Full tier (fine pointer, many cores) — today's baseline.
  await forceDeviceClass(page, 'full')
  await page.goto('/')
  const fullAvg = await averageConcurrency(page)
  expect(fullAvg).toBeGreaterThan(20)

  // Low tier: same grid, but the concurrency target is scaled to 0.4, so far
  // fewer cells are mid-hop at once. The measurements are taken back-to-back on
  // the same page so shared machine load cancels out; the true ratio is ~0.4,
  // so a 0.7 bound leaves generous headroom while still catching a broken scale.
  await forceDeviceClass(page, 'low')
  await page.goto('/')
  const lowAvg = await averageConcurrency(page)

  expect(lowAvg).toBeLessThan(fullAvg * 0.7)
})

test('the prompt is spelled out in the loading noise', async ({ page }) => {
  await page.goto('/')
  await expect(async () => {
    expect(await page.locator('.board').textContent()).toContain('CLICK TO START')
  }).toPass({ timeout: 3000 })
})
