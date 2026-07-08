import { test, expect } from '@playwright/test'
import { settle, start } from './helpers'

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
  // nav title shows its real, settled face.
  await settle(page)
  await expect(page.locator('.nav .cell').first()).toHaveText('P')
})

test('the prompt is spelled out in the loading noise', async ({ page }) => {
  await page.goto('/')
  await expect(async () => {
    expect(await page.locator('.board').textContent()).toContain('CLICK TO START')
  }).toPass({ timeout: 3000 })
})
