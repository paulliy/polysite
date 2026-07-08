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
