/**
 * Build-time markdown loader (CLAUDE.md: content is parsed at build time,
 * no CMS). Every .md under content/ is bundled as a raw string and mapped
 * to its route: home.md → '/', projects/foo.md → '/projects/foo'.
 */

const files = import.meta.glob('../../content/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const PREFIX = '../../content/'

function routeFor(filePath: string): string {
  const rel = filePath.slice(PREFIX.length).replace(/\.md$/, '')
  return rel === 'home' ? '/' : `/${rel}`
}

export const contentByRoute: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(files).map(([path, markdown]) => [routeFor(path), markdown]),
)

export const NOT_FOUND_MARKDOWN = `# 404

Nothing at this address. The board reset itself.

Head back [home](/) or to the [projects](/projects).
`

/** Markdown for a route path, or the 404 page if there is none. */
export function contentForPath(path: string): string {
  const normalized = path !== '/' && path.endsWith('/') ? path.slice(0, -1) : path
  return contentByRoute[normalized] ?? NOT_FOUND_MARKDOWN
}
