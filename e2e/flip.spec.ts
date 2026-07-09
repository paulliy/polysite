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
  // …the nav menu labels are identical across this navigation, but the
  // "you are here" hyphen marker moves from Home to Projects — a handful of
  // flank cells flip, not the whole row.
  await expect(page.locator('.nav .flip').first()).toBeVisible()
  const navFlipCount = await page.locator('.nav .flip').count()
  const navCellCount = await page.locator('.nav .cell').count()
  expect(navFlipCount).toBeGreaterThan(0)
  expect(navFlipCount).toBeLessThan(navCellCount / 2)
  // On the desktop layout the "POLYSITE" title is shown and holds its face; the
  // narrow mobile grid drops the title (first nav cells blank), so guard it. The
  // row is inset one column (NAV_MARGIN), so the title starts at column 1.
  const isMobile = (page.viewportSize()?.width ?? 0) < 700
  if (!isMobile) {
    await expect(page.locator('.nav .cell').nth(1)).toHaveText('P')
  }

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
