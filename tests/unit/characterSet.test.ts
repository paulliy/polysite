import { describe, it, expect } from 'vitest'
import {
  BLANK,
  CHARACTER_SET,
  FALLBACK_FACE,
  ICONS,
  isFace,
  isIcon,
  normalizeChar,
  normalizeText,
  randomSpinFace,
  spinPoolFor,
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

  it('keeps flip intermediates in the target face category', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomSpinFace('a', 'B')).toMatch(/^[A-Z]$/)
      expect(randomSpinFace('Q', 'x')).toMatch(/^[a-z]$/)
      expect(randomSpinFace('1', '7')).toMatch(/^[0-9]$/)
      expect(randomSpinFace('a', '!')).not.toMatch(/^[A-Za-z0-9 ]$/)
    }
  })

  it('never returns an endpoint, blank, or icon as an intermediate', () => {
    for (let i = 0; i < 50; i++) {
      const face = randomSpinFace('a', 'b')
      expect(face).not.toBe('a')
      expect(face).not.toBe('b')
      expect(face).not.toBe(BLANK)
      expect(Object.values(ICONS)).not.toContain(face)
    }
  })

  it('spins toward blank in the old face category, and not at all between blanks', () => {
    expect(spinPoolFor('x', BLANK).every((f) => /^[a-z]$/.test(f))).toBe(true)
    expect(spinPoolFor('x', BLANK).length).toBeGreaterThan(0)
    expect(spinPoolFor(BLANK, '5').every((f) => /^[0-9]$/.test(f))).toBe(true)
    expect(spinPoolFor(BLANK, BLANK)).toHaveLength(0)
    expect(randomSpinFace(BLANK, BLANK)).toBeNull()
    expect(spinPoolFor(BLANK, ICONS.email)).toHaveLength(0)
  })

  it('folds typographic characters to ASCII at the text level', () => {
    expect(normalizeText('“smart” — quotes…')).toBe('"smart" - quotes...')
  })
})
