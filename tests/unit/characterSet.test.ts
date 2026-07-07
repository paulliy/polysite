import { describe, it, expect } from 'vitest'
import {
  BLANK,
  CHARACTER_SET,
  FALLBACK_FACE,
  ICONS,
  SPIN_FACES,
  isFace,
  isIcon,
  normalizeChar,
  normalizeText,
  randomSpinFace,
} from '@/engine/characterSet'

describe('characterSet', () => {
  it('contains uppercase, lowercase, digits, punctuation, and blank', () => {
    for (const ch of 'AZaz09') expect(isFace(ch)).toBe(true)
    for (const ch of '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~') expect(isFace(ch)).toBe(true)
    expect(isFace(BLANK)).toBe(true)
  })

  it('has no duplicate faces', () => {
    expect(new Set(CHARACTER_SET).size).toBe(CHARACTER_SET.length)
  })

  it('includes every icon glyph as a face', () => {
    for (const glyph of Object.values(ICONS)) {
      expect(isFace(glyph)).toBe(true)
      expect(isIcon(glyph)).toBe(true)
    }
    expect(isIcon('a')).toBe(false)
  })

  it('passes known faces through normalizeChar untouched', () => {
    expect(normalizeChar('A')).toBe('A')
    expect(normalizeChar(BLANK)).toBe(BLANK)
    expect(normalizeChar(ICONS.email)).toBe(ICONS.email)
  })

  it('strips diacritics to a base face', () => {
    expect(normalizeChar('é')).toBe('e')
    expect(normalizeChar('Ü')).toBe('U')
  })

  it('falls back for unmappable characters', () => {
    expect(normalizeChar('→')).toBe(FALLBACK_FACE)
    expect(normalizeChar('漢')).toBe(FALLBACK_FACE)
  })

  it('spins through real glyphs only — no blank, no icons', () => {
    expect(SPIN_FACES.length).toBeGreaterThan(50)
    expect(SPIN_FACES).not.toContain(BLANK)
    for (const icon of Object.values(ICONS)) expect(SPIN_FACES).not.toContain(icon)
    for (let i = 0; i < 100; i++) expect(SPIN_FACES).toContain(randomSpinFace())
  })

  it('folds typographic characters to ASCII at the text level', () => {
    expect(normalizeText('“smart” — quotes…')).toBe('"smart" - quotes...')
  })
})
