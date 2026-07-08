import { test, expect } from '@playwright/test'
import { settle, start } from './helpers'

test('desktop uses the wide grid', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await start(page)
  await settle(page, 15000)
  const cols = await page.locator('.board-row').first().evaluate((el) => el.childElementCount)
  expect(cols).toBe(56)
})

test('mobile viewport re-flows to the narrow grid', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await start(page)
  await settle(page, 15000)
  const cols = await page.locator('.board-row').first().evaluate((el) => el.childElementCount)
  expect(cols).toBe(28)
})

test('icon glyphs render as inline SVG on the board', async ({ page }) => {
  await page.goto('/about')
  await start(page)
  await settle(page, 15000)
  expect(await page.locator('.board .icon svg').count()).toBeGreaterThanOrEqual(3)
})

test('a content image renders as pixelated block cells', async ({ page }) => {
  await page.goto('/projects/split-flap-engine')
  await start(page)
  await settle(page, 15000)
  let blocks = 0
  for (let i = 0; i < 6 && blocks < 30; i++) {
    blocks = await page.evaluate(
      () => (document.querySelector('.board')?.textContent?.match(/█/g) || []).length,
    )
    if (blocks >= 30) break
    await page.keyboard.press('ArrowDown')
    await settle(page)
  }
  expect(blocks).toBeGreaterThan(30)
})
