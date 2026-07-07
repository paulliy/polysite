import { test, expect } from '@playwright/test'

test('serves the app shell on a black background', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('#app')).toBeVisible()
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  expect(bg).toBe('rgb(0, 0, 0)')
})
