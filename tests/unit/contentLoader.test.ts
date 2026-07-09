import { describe, it, expect } from 'vitest'
import { contentByRoute, contentForPath, NOT_FOUND_MARKDOWN } from '@/content/loader'

describe('content loader', () => {
  it('maps every content file to a clean route', () => {
    const routes = Object.keys(contentByRoute)
    expect(routes).toContain('/')
    expect(routes).toContain('/contact')
    expect(routes).toContain('/projects')
    for (const route of routes) {
      expect(route).toMatch(/^\/[a-z0-9\-/]*$/)
      expect(route).not.toContain('.md')
    }
  })

  it('exposes at least one project article route', () => {
    expect(Object.keys(contentByRoute).some((r) => r.startsWith('/projects/'))).toBe(true)
  })

  it('returns markdown for known paths, tolerating a trailing slash', () => {
    expect(contentForPath('/contact')).toBe(contentByRoute['/contact'])
    expect(contentForPath('/contact/')).toBe(contentByRoute['/contact'])
    expect(contentForPath('/')).toBe(contentByRoute['/'])
  })

  it('falls back to the 404 page for unknown paths', () => {
    expect(contentForPath('/no/such/page')).toBe(NOT_FOUND_MARKDOWN)
  })
})
