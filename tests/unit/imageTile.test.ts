import { describe, it, expect } from 'vitest'
import { imageToTileRender, tileBackgroundStyle } from '@/engine/imageTile'
import type { ImageTileRef } from '@/engine/types'

describe('imageToTileRender', () => {
  it('fills blank lines sized to the aspect-fit grid', () => {
    // Square image into a 4-wide bound: cell aspect (0.5) halves the rows.
    const render = imageToTileRender('/img.png', 100, 100, 4, 10)
    expect(render.lines).toEqual(['    ', '    ']) // 4 cols × 2 rows
    expect(render.tiles?.length).toBe(2)
    expect(render.tiles?.[0]?.length).toBe(4)
  })

  it('locates each cell in the tile grid', () => {
    const { tiles } = imageToTileRender('/img.png', 100, 100, 4, 10)
    expect(tiles?.[0]?.[0]).toEqual({ src: '/img.png', col: 0, row: 0, cols: 4, rows: 2 })
    expect(tiles?.[1]?.[3]).toEqual({ src: '/img.png', col: 3, row: 1, cols: 4, rows: 2 })
  })

  it('clamps a tall image to the row bound', () => {
    // Very tall image: rows fill maxRows, cols shrink to preserve aspect.
    const { lines } = imageToTileRender('/tall.png', 100, 400, 20, 6)
    expect(lines.length).toBe(6)
    expect(lines[0]?.length).toBeGreaterThanOrEqual(1)
    expect(lines[0]?.length).toBeLessThan(20)
  })
})

describe('tileBackgroundStyle', () => {
  const tile = (over: Partial<ImageTileRef>): ImageTileRef => ({
    src: '/img.png',
    col: 0,
    row: 0,
    cols: 4,
    rows: 2,
    ...over,
  })

  it('sizes the background to the grid in cell units', () => {
    expect(tileBackgroundStyle(tile({})).backgroundSize).toBe(
      'calc(var(--cell-w) * 4) calc(var(--cell-h) * 2)',
    )
  })

  it('walks the position left/up by this cell in grid units', () => {
    expect(tileBackgroundStyle(tile({ col: 0, row: 0 })).backgroundPosition).toBe(
      'calc(var(--cell-w) * 0) calc(var(--cell-h) * 0)',
    )
    expect(tileBackgroundStyle(tile({ col: 3, row: 1 })).backgroundPosition).toBe(
      'calc(var(--cell-w) * -3) calc(var(--cell-h) * -1)',
    )
  })

  it('wraps the src in a url() reference', () => {
    expect(tileBackgroundStyle(tile({ src: '/photo.jpg' })).backgroundImage).toBe('url("/photo.jpg")')
  })
})
