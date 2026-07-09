import { test, expect } from '@playwright/test'

test('exposes the page as a real semantic parallel DOM', async ({ page }) => {
  await page.goto('/contact')
  const hidden = page.locator('.sr-only')
  // A real heading and body text — findable by screen readers and Ctrl+F.
  await expect(hidden.locator('h1')).toContainText('Contact')
  await expect(hidden).toContainText('single fixed grid of split-flap characters')
  // Links are real anchors: mailto stays an <a>, internal routes are present.
  await expect(hidden.locator('a[href="mailto:paulfangli@gmail.com"]')).toHaveCount(1)
  await expect(hidden.locator('nav a[href="/projects"]')).toHaveCount(1)
})

test('the parallel DOM updates on navigation', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.sr-only h1')).toContainText('Paul Li')
  await page.goto('/projects')
  await expect(page.locator('.sr-only h1')).toContainText('Projects')
})

test('hidden nav links are keyboard-focusable and route', async ({ page, browserName }) => {
  // WebKit (desktop Safari + Mobile Safari) does not move Tab focus to links
  // unless the OS "Full Keyboard Access" setting is on — which Playwright's
  // WebKit build can't enable. The links are real, focusable <a> anchors (the
  // parallel-DOM assertions above cover their presence); this Tab-order check is
  // only meaningful on engines that Tab to links by default.
  test.skip(browserName === 'webkit', 'WebKit needs Full Keyboard Access to Tab to links')
  await page.goto('/')
  // The board cells are aria-hidden and not focusable, so the first Tab lands
  // on the hidden nav's first real link.
  await page.keyboard.press('Tab')
  const focusedHref = await page.evaluate(() => document.activeElement?.getAttribute('href'))
  expect(focusedHref).toBe('/')
  // Tab to the Projects link and activate it with the keyboard.
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(page).toHaveURL(/\/$/)
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/\/contact$/)
})

test.describe('prefers-reduced-motion', () => {
  test.use({ reducedMotion: 'reduce' })

  // Belt-and-suspenders: also emulate at runtime so window.matchMedia reflects
  // the preference (the context-level option alone doesn't surface to
  // matchMedia in this Playwright build), which is how the app detects it.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
  })

  test('shows content directly with no flips on load', async ({ page }) => {
    await page.goto('/projects/split-flap-engine')
    // Content is present immediately on the board — the real heading text.
    await expect(page.locator('.board-row').first()).toContainText('The split-flap engine')
    // Nothing ever animates: no loading noise, no reveal flips (reduced motion
    // never mounts a `.flip`, so this is deterministic once content is shown).
    await expect(page.locator('.flip')).toHaveCount(0)
  })

  test('navigation swaps instantly, still no flips', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('.board-row').first()).toContainText('Paul Li')
    await page.locator('[data-href="/projects"]').first().click()
    await expect(page).toHaveURL(/\/projects$/)
    await expect(page.locator('.board-row').first()).toContainText('Projects')
    await expect(page.locator('.flip')).toHaveCount(0)
  })
})
