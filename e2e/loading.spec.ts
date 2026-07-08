import { test, expect } from '@playwright/test'

test('runs a loading-noise intro on first load, then settles into content', async ({ page }) => {
  await page.goto('/')

  // During the intro every cell animates its own noise → many `.flip` elements
  // are mounted at once (idle cells never mount `.flip`).
  await expect(async () => {
    expect(await page.locator('.flip').count()).toBeGreaterThan(100)
  }).toPass({ timeout: 3000 })

  // Once the intro completes the whole board settles: no `.flip` elements remain
  // and the nav title shows its real, settled face.
  await expect(page.locator('.flip')).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('.nav .cell').first()).toHaveText('P')
})
