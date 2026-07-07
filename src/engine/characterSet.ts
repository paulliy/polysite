/**
 * The full set of faces a flap cell can show: uppercase, lowercase, digits,
 * punctuation, space, and a small fixed set of icon glyphs (brief §2).
 * Icons live in the Unicode Private Use Area so they flow through the text
 * pipeline like any other character; rendering maps them to SVG in Phase 8.
 */

export const BLANK = ' '
export const FALLBACK_FACE = '?'

export const ICONS = {
  email: '\uE000',
  externalLink: '\uE001',
  arrowRight: '\uE002',
  github: '\uE003',
  linkedin: '\uE004',
} as const

export type IconName = keyof typeof ICONS

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const LOWER = 'abcdefghijklmnopqrstuvwxyz'
const DIGITS = '0123456789'
const PUNCTUATION = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~'

export const CHARACTER_SET: readonly string[] = [
  BLANK,
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

/** Faces eligible as random flip intermediates: no blank, no icons. */
export const SPIN_FACES: readonly string[] = CHARACTER_SET.filter(
  (c) => c !== BLANK && !ICON_CHARS.has(c),
)

/** A random non-blank, non-icon face for the flap-through animation. */
export function randomSpinFace(): string {
  return SPIN_FACES[Math.floor(Math.random() * SPIN_FACES.length)] ?? FALLBACK_FACE
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
