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
