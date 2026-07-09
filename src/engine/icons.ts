/**
 * SVG for the icon faces (brief §2). Icons live in the character set as PUA
 * codepoints (see characterSet.ts) so they flow through pagination and flip
 * like any other face; here we map each codepoint to inline SVG markup. Paths
 * are Lucide-style (24×24, stroke geometry). Framework-agnostic strings — the
 * board draws them via innerHTML (imperative flip faces) and IconGlyph.vue.
 */

import { ICONS } from './characterSet'

const PATHS: Record<string, string> = {
  [ICONS.email]:
    '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  [ICONS.externalLink]:
    '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  [ICONS.arrowRight]: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  [ICONS.github]:
    '<path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.4 5.4 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4"/><path d="M9 18c-4.51 2-5-2-7-2"/>',
  [ICONS.linkedin]:
    '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect width="4" height="12" x="2" y="9"/><circle cx="4" cy="4" r="2"/>',
  [ICONS.apple]:
    '<path d="M12 20.94c1.5 0 2.75 1.06 4 1.06 3 0 6-8 6-12.22A4.91 4.91 0 0 0 17 5c-2.22 0-4 1.44-5 2-1-.56-2.78-2-5-2a4.9 4.9 0 0 0-5 4.78C2 14 5 22 8 22c1.25 0 2.5-1.06 4-1.06Z"/><path d="M10 2c1 .5 2 2 2 5"/>',
  [ICONS.resume]:
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  [ICONS.wave]:
    '<path d="M18 11V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v0"/><path d="M14 10V4a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2v0a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
}

/** Accessible label per icon, for the semantic parallel DOM. */
export const ICON_LABELS: Record<string, string> = {
  [ICONS.email]: 'email',
  [ICONS.externalLink]: 'external link',
  [ICONS.arrowRight]: 'arrow',
  [ICONS.github]: 'GitHub',
  [ICONS.linkedin]: 'LinkedIn',
  [ICONS.apple]: 'apple',
  [ICONS.resume]: 'resume',
  [ICONS.wave]: 'wave',
}

/** Inline SVG markup for an icon face, sized to the current font (1em), or
 *  null if the char isn't an icon. Markup is static and trusted. */
export function iconSvg(char: string): string | null {
  const path = PATHS[char]
  if (!path) return null
  return (
    '<svg viewBox="0 0 24 24" width="0.82em" height="0.82em" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    `stroke-linejoin="round" aria-hidden="true">${path}</svg>`
  )
}
