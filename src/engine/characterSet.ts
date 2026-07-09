/**
 * The full set of faces a flap cell can show: uppercase, lowercase, digits,
 * punctuation, space, and a small fixed set of icon glyphs (brief §2).
 * Icons live in the Unicode Private Use Area so they flow through the text
 * pipeline like any other character; rendering maps them to SVG in Phase 8.
 */

export const BLANK = ' '
export const FALLBACK_FACE = '?'
/** Full-cell block, the "lit" face for pixelated images (brief §2). */
export const BLOCK = '█'

/**
 * 2×2 sub-cell block glyphs, indexed by a 4-bit mask of which sub-pixels are
 * lit (bit 0 = top-left, 1 = top-right, 2 = bottom-left, 3 = bottom-right).
 * Lets one flap encode four image sub-pixels, quadrupling image resolution
 * without shrinking the grid (see engine/imageToGrid.ts). Index 0 is blank and
 * index 15 is the full BLOCK, so the whole range is a superset of the old
 * two-tone faces.
 */
export const QUADRANT_BY_MASK: readonly string[] = [
  BLANK, // 0000
  '▘', // 0001 TL
  '▝', // 0010 TR
  '▀', // 0011 TL TR
  '▖', // 0100 BL
  '▌', // 0101 TL BL
  '▞', // 0110 TR BL
  '▛', // 0111 TL TR BL
  '▗', // 1000 BR
  '▚', // 1001 TL BR
  '▐', // 1010 TR BR
  '▜', // 1011 TL TR BR
  '▄', // 1100 BL BR
  '▙', // 1101 TL BL BR
  '▟', // 1110 TR BL BR
  BLOCK, // 1111 all
]

/**
 * Light box-drawing faces used for the optional border ring around content
 * images (see engine/border.ts). Like the quadrant blocks they have no spin
 * category, so border cells flip directly to their target face.
 */
export const BORDER_GLYPHS = {
  horizontal: '─',
  vertical: '│',
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
} as const

export const ICONS = {
  email: '\uE000',
  externalLink: '\uE001',
  arrowRight: '\uE002',
  github: '\uE003',
  linkedin: '\uE004',
  /**
   * Decorative \u2014 the apple the border snake chases (engine/snake.ts). It has no
   * `:shortcode:` so it can't be authored into content; it only ever appears as
   * a transient overlay face on a hovered image's border ring.
   */
  apple: '\uE005',
  resume: '\uE006',
  wave: '\uE007',
} as const

export type IconName = keyof typeof ICONS

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

export const CHARACTER_SET: readonly string[] = [
  BLANK,
  ...QUADRANT_BY_MASK.slice(1), // sub-cell blocks incl. the full BLOCK
  ...Object.values(BORDER_GLYPHS),
  ...UPPER,
  ...LOWER,
  ...DIGITS,
  ...PUNCTUATION,
  ...Object.values(ICONS),
]

const FACE_SET = new Set(CHARACTER_SET)

const ICON_CHARS = new Set<string>(Object.values(ICONS))

export function isFace(char: string): boolean {
  return FACE_SET.has(char)
}

export function isIcon(char: string): boolean {
  return ICON_CHARS.has(char)
}

/** Authorable `:name:` tokens that expand to icon faces in content. */
const ICON_SHORTCODES: Record<string, string> = {
  ':mail:': ICONS.email,
  ':external:': ICONS.externalLink,
  ':arrow:': ICONS.arrowRight,
  ':github:': ICONS.github,
  ':linkedin:': ICONS.linkedin,
  ':resume:': ICONS.resume,
  ':wave:': ICONS.wave,
}

const SHORTCODE_RE = /:(?:mail|external|arrow|github|linkedin|resume|wave):/g

/** Replace `:name:` shortcodes with their single icon face character. */
export function expandIconShortcodes(text: string): string {
  return text.replace(SHORTCODE_RE, (match) => ICON_SHORTCODES[match] ?? match)
}

const UPPER_FACES: readonly string[] = [...UPPER]
const LOWER_FACES: readonly string[] = [...LOWER]
const DIGIT_FACES: readonly string[] = [...DIGITS]
const PUNCTUATION_FACES: readonly string[] = [...PUNCTUATION]

function poolFor(char: string): readonly string[] | null {
  if (UPPER.includes(char)) return UPPER_FACES
  if (LOWER.includes(char)) return LOWER_FACES
  if (DIGITS.includes(char)) return DIGIT_FACES
  if (PUNCTUATION.includes(char)) return PUNCTUATION_FACES
  return null // blank and icons have no spin category
}

/**
 * Flip intermediates stay in the target face's category — letters spin
 * through letters, digits through digits, punctuation through punctuation.
 * A cell heading to blank spins in its old face's category; blank and icon
 * faces are never intermediates.
 */
export function spinPoolFor(from: string, to: string): readonly string[] {
  return poolFor(to) ?? poolFor(from) ?? []
}

/** A random intermediate face, never equal to either endpoint; null if none. */
export function randomSpinFace(from: string, to: string): string | null {
  const pool = spinPoolFor(from, to)
  if (pool.length === 0) return null
  for (let attempt = 0; attempt < 8; attempt++) {
    const face = pool[Math.floor(Math.random() * pool.length)] ?? FALLBACK_FACE
    if (face !== from && face !== to) return face
  }
  return null
}

/** Every visible glyph a cell can flap through — no blank, no icons. */
export const LOADING_FACES: readonly string[] = [
  ...UPPER,
  ...LOWER,
  ...DIGITS,
  ...PUNCTUATION,
]

/**
 * A random face for the pre-content loading noise (CLAUDE.md #9): any
 * category, never blank or an icon, and never equal to `exclude` (the face
 * currently shown) so a cell visibly changes on each hop.
 */
export function randomLoadingFace(exclude?: string): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const face = LOADING_FACES[Math.floor(Math.random() * LOADING_FACES.length)] ?? FALLBACK_FACE
    if (face !== exclude) return face
  }
  return FALLBACK_FACE
}

/** Typographic characters authors commonly paste that we fold to ASCII. */
const TEXT_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/[‘’]/g, "'"],
  [/[“”]/g, '"'],
  [/[–—]/g, '-'],
  [/…/g, '...'],
  [/ /g, ' '],
]

/**
 * String-level normalization applied to authored content before wrapping —
 * handles replacements that change length (e.g. "…" → "..." ).
 */
export function normalizeText(text: string): string {
  let out = text
  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }
  return out
}

/**
 * Cell-level normalization: map any single character to a displayable face.
 * Known faces pass through; accented letters lose their diacritics; anything
 * else becomes the fallback face.
 */
export function normalizeChar(char: string): string {
  if (FACE_SET.has(char)) return char
  const stripped = char.normalize('NFD').replace(/[\u0300-\u036F]/g, '')
  if (FACE_SET.has(stripped)) return stripped
  return FALLBACK_FACE
}
