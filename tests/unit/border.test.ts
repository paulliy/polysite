import { describe, it, expect } from 'vitest'
import { withBorder } from '@/engine/border'
import { BORDER_GLYPHS, CHARACTER_SET, spinPoolFor } from '@/engine/characterSet'

describe('withBorder', () => {
  it('wraps the render in a one-cell box-drawing ring', () => {
    const bordered = withBorder({ lines: ['##', '##'] })
    expect(bordered.lines).toEqual(['┌──┐', '│##│', '│##│', '└──┘'])
  })

  it('passes an empty render through untouched', () => {
    const empty = { lines: [] }
    expect(withBorder(empty)).toBe(empty)
  })

  it('pads the color grid with null (default palette) border cells', () => {
    const c = { fg: 'red', bg: 'blue' }
    const bordered = withBorder({ lines: ['#'], colors: [[c]] })
    expect(bordered.colors).toEqual([
      [null, null, null],
      [null, c, null],
      [null, null, null],
    ])
  })

  it('leaves colors undefined when the render has none', () => {
    expect(withBorder({ lines: ['#'] }).colors).toBeUndefined()
  })

  it('pads the tile grid with null (no-image) border cells', () => {
    const t = { src: '/i.png', col: 0, row: 0, cols: 1, rows: 1 }
    const bordered = withBorder({ lines: [' '], tiles: [[t]] })
    expect(bordered.tiles).toEqual([
      [null, null, null],
      [null, t, null],
      [null, null, null],
    ])
  })

  it('leaves tiles undefined when the render has none', () => {
    expect(withBorder({ lines: ['#'] }).tiles).toBeUndefined()
  })
})

describe('border glyphs as board faces', () => {
  it('are all in the character set (so frameToGrid does not fall back)', () => {
    for (const glyph of Object.values(BORDER_GLYPHS)) {
      expect(CHARACTER_SET).toContain(glyph)
    }
  })

  it('have no spin category — border cells flip directly, like blocks', () => {
    for (const glyph of Object.values(BORDER_GLYPHS)) {
      expect(spinPoolFor(' ', glyph)).toEqual([])
    }
  })
})
