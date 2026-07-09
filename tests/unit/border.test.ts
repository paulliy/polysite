import { describe, it, expect } from 'vitest'
import { borderRingPath, detectBorderRings, withBorder } from '@/engine/border'
import { BORDER_GLYPHS, CHARACTER_SET, spinPoolFor } from '@/engine/characterSet'

/** Turn a picture of a grid (array of equal-length strings) into a face grid. */
const grid = (rows: string[]) => rows.map((r) => [...r])

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

describe('detectBorderRings', () => {
  it('finds a drawn ring and reports its outer rectangle', () => {
    const g = grid([
      '      ',
      ' ┌──┐ ',
      ' │xx│ ',
      ' └──┘ ',
      '      ',
    ])
    expect(detectBorderRings(g)).toEqual([{ row: 1, col: 1, width: 4, height: 3 }])
  })

  it('ignores stray box glyphs that do not close into a ring', () => {
    const g = grid([
      '┌── ',
      '│  x',
      '  ─┘',
    ])
    expect(detectBorderRings(g)).toEqual([])
  })

  it('finds multiple independent rings', () => {
    const g = grid([
      '┌─┐  ',
      '│x│  ',
      '└─┘┌─┐',
      '   │x│',
      '   └─┘',
    ])
    expect(detectBorderRings(g)).toHaveLength(2)
  })
})

describe('borderRingPath', () => {
  it('walks the perimeter clockwise from the top-left, each cell once', () => {
    const path = borderRingPath({ row: 0, col: 0, width: 3, height: 3 })
    expect(path).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
      { row: 1, col: 2 },
      { row: 2, col: 2 },
      { row: 2, col: 1 },
      { row: 2, col: 0 },
      { row: 1, col: 0 },
    ])
  })

  it('has length 2*(width+height)-4 with no duplicate cells', () => {
    const rect = { row: 2, col: 5, width: 6, height: 4 }
    const path = borderRingPath(rect)
    expect(path).toHaveLength(2 * (rect.width + rect.height) - 4)
    expect(new Set(path.map((c) => `${c.row}:${c.col}`)).size).toBe(path.length)
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
