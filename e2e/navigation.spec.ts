import { test, expect } from '@playwright/test'

declare global {
  interface Window {
    __board?: Element | null
  }
}

test('nav links route to real URLs without remounting the board', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.board')).toBeVisible()

  // Remember the live board DOM node, then navigate via a nav link cell.
  await page.evaluate(() => {
    window.__board = document.querySelector('.board')
  })
  await page.locator('[data-href="/projects"]').first().click()

  await expect(page).toHaveURL(/\/projects$/)
  // The projects page lists article links — proof the content retargeted.
  await expect(page.locator('[data-href="/projects/split-flap-engine"]').first()).toBeVisible()

  // CLAUDE.md #4: same DOM node — the route change must not remount the board.
  const sameNode = await page.evaluate(() => window.__board === document.querySelector('.board'))
  expect(sameNode).toBe(true)
})

test('article URLs are directly bookmarkable', async ({ page }) => {
  await page.goto('/projects/grid-pagination')
  await expect(page.locator('.board')).toBeVisible()
  await expect(page.locator('[data-href="/projects"]').first()).toBeVisible()
})

test('unknown paths show the 404 content on the board', async ({ page }) => {
  await page.goto('/definitely/not/a/page')
  await expect(page.locator('[data-href="/"]').first()).toBeVisible()
})

test('keyboard input pages through a long article', async ({ page }) => {
  await page.goto('/projects/split-flap-engine')
  // Wait for the arrival flips to settle so we read settled faces.
  await expect(page.locator('.flip')).toHaveCount(0, { timeout: 10_000 })
  const firstRow = page.locator('.board-row').first()
  const before = await firstRow.textContent()

  await page.keyboard.press('ArrowDown')
  await expect(firstRow).not.toHaveText(before ?? '')

  // Paging back up restores the first frame. Retry the press because a key
  // landing inside the step cooldown is deliberately swallowed.
  await expect(async () => {
    await page.keyboard.press('ArrowUp')
    await expect(firstRow).toHaveText(before ?? '', { timeout: 250 })
  }).toPass()
})
