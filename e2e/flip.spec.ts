import { test, expect } from '@playwright/test'
import { settle, start } from './helpers'

test('navigation flips changed cells while unchanged nav cells hold still', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.board')).toBeVisible()
  // Start the intro and let the initial flip-in settle completely.
  await start(page)
  await settle(page)

  await page.locator('[data-href="/projects"]').first().click()

  // Changed cells animate…
  await expect(page.locator('.flip').first()).toBeVisible()
  // …but the nav title cell ("P" of POLYSITE) keeps its face and must not.
  const titleCell = page.locator('.nav .cell').first()
  await expect(titleCell.locator('.flip')).toHaveCount(0)
  await expect(titleCell).toHaveText('P')

  // Everything settles back to plain faces.
  await settle(page)
})

test('scrolling a long article flips only the cells that change', async ({ page }) => {
  await page.goto('/projects/split-flap-engine')
  await start(page)
  await settle(page)

  await page.keyboard.press('ArrowDown')
  await expect(page.locator('.flip').first()).toBeVisible()
  await settle(page)
})
