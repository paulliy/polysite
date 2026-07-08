import { describe, it, expect } from 'vitest'
import { gridDimensionsFor, gridToCharLines, pixelsToGrid } from '@/engine/imageToGrid'
import { BLANK, BLOCK } from '@/engine/characterSet'
import type { PixelSource } from '@/engine/types'

describe('gridToCharLines', () => {
  it('maps lit cells to the block face and unlit to blank', () => {
    expect(
      gridToCharLines([
        [true, false],
        [false, true],
      ]),
    ).toEqual([`${BLOCK}${BLANK}`, `${BLANK}${BLOCK}`])
  })

  it('accepts custom lit/unlit characters', () => {
    expect(gridToCharLines([[true, false]], '#', '.')).toEqual(['#.'])
  })
})

/** Build an RGBA buffer from rows of 0..255 gray values. */
function grayImage(rows: number[][]): PixelSource {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8ClampedArray(width * height * 4)
  rows.flat().forEach((v, i) => {
    data[i * 4] = v
    data[i * 4 + 1] = v
    data[i * 4 + 2] = v
    data[i * 4 + 3] = 255
  })
  return { width, height, data }
}

describe('pixelsToGrid — threshold mode', () => {
  it('maps light blocks on and dark blocks off', () => {
    const src = grayImage([
      [255, 255, 0, 0],
      [255, 255, 0, 0],
    ])
    const grid = pixelsToGrid(src, { cols: 2, rows: 1, mode: 'threshold' })
    expect(grid).toEqual([[true, false]])
  })

  it('averages within a block', () => {
    // Block of 200 and 100 averages to 150 (~0.59) -> above default 0.5 cutoff.
    const src = grayImage([[200, 100]])
    const grid = pixelsToGrid(src, { cols: 1, rows: 1, mode: 'threshold' })
    expect(grid).toEqual([[true]])
  })

  it('respects a custom threshold', () => {
    const src = grayImage([[150]])
    expect(pixelsToGrid(src, { cols: 1, rows: 1, mode: 'threshold', threshold: 0.8 })).toEqual([
      [false],
    ])
  })

  it('treats transparent pixels as black', () => {
    const src = grayImage([[255]])
    src.data[3] = 0 // alpha
    expect(pixelsToGrid(src, { cols: 1, rows: 1, mode: 'threshold' })).toEqual([[false]])
  })
})

describe('pixelsToGrid — bayer mode', () => {
  it('is deterministic', () => {
    const src = grayImage([
      [128, 128, 128, 128],
      [128, 128, 128, 128],
      [128, 128, 128, 128],
      [128, 128, 128, 128],
    ])
    const a = pixelsToGrid(src, { cols: 4, rows: 4 })
    const b = pixelsToGrid(src, { cols: 4, rows: 4 })
    expect(a).toEqual(b)
  })

  it('renders mid-gray as a mix of on and off cells', () => {
    const src = grayImage(
      Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => 128)),
    )
    const cells = pixelsToGrid(src, { cols: 4, rows: 4 }).flat()
    expect(cells.some((c) => c)).toBe(true)
    expect(cells.some((c) => !c)).toBe(true)
  })

  it('keeps pure black fully off and pure white fully on', () => {
    const black = grayImage([
      [0, 0],
      [0, 0],
    ])
    const white = grayImage([
      [255, 255],
      [255, 255],
    ])
    expect(pixelsToGrid(black, { cols: 2, rows: 2 }).flat().every((c) => !c)).toBe(true)
    expect(pixelsToGrid(white, { cols: 2, rows: 2 }).flat().every((c) => c)).toBe(true)
  })
})

describe('pixelsToGrid — validation', () => {
  it('rejects a buffer that does not match its dimensions', () => {
    const bad: PixelSource = { width: 2, height: 2, data: new Uint8ClampedArray(4) }
    expect(() => pixelsToGrid(bad, { cols: 1, rows: 1 })).toThrow(/buffer size/)
  })
})

describe('gridDimensionsFor', () => {
  it('fills the max width for a wide image', () => {
    const { cols, rows } = gridDimensionsFor(400, 100, 40, 20)
    expect(cols).toBe(40)
    expect(rows).toBe(5) // 40 * (100/400) * 0.5
  })

  it('clamps to max rows for a tall image', () => {
    const { cols, rows } = gridDimensionsFor(100, 400, 40, 20)
    expect(rows).toBe(20)
    expect(cols).toBe(10) // 20 / ((400/100) * 0.5)
  })

  it('never returns zero-sized output', () => {
    const { cols, rows } = gridDimensionsFor(10000, 10, 40, 20)
    expect(cols).toBeGreaterThanOrEqual(1)
    expect(rows).toBeGreaterThanOrEqual(1)
  })
})
