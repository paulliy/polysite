/**
 * Image → two-tone grid approximation (brief §2): sample pixel brightness per
 * character cell, then threshold or ordered-dither down to on (off-white) /
 * off (black). This module is the pure half — it consumes an RGBA buffer.
 * The canvas glue that produces that buffer from an <img> lives in
 * content/imageLoader.ts (browser-only).
 */

import type { PixelSource } from './types'
import { BLANK, BLOCK } from './characterSet'

export interface ImageToGridOptions {
  /** Output grid size in character cells. */
  cols: number
  rows: number
  /** 'bayer' (default) gives a classic ordered-dither texture. */
  mode?: 'threshold' | 'bayer'
  /** Luminance cutoff in [0, 1] for 'threshold' mode. */
  threshold?: number
}

/**
 * A character cell is roughly twice as tall as it is wide; without this
 * correction images come out vertically squashed.
 */
export const CELL_ASPECT = 0.5

/** Fit an image into max grid bounds, preserving aspect ratio in cell units. */
export function gridDimensionsFor(
  imageWidth: number,
  imageHeight: number,
  maxCols: number,
  maxRows: number,
  cellAspect = CELL_ASPECT,
): { cols: number; rows: number } {
  if (imageWidth <= 0 || imageHeight <= 0) throw new Error('image has no pixels')
  // Rows the image needs if it spans maxCols.
  const rowsAtFullWidth = maxCols * (imageHeight / imageWidth) * cellAspect
  if (rowsAtFullWidth <= maxRows) {
    return { cols: maxCols, rows: Math.max(1, Math.round(rowsAtFullWidth)) }
  }
  const cols = maxRows / ((imageHeight / imageWidth) * cellAspect)
  return { cols: Math.max(1, Math.round(cols)), rows: maxRows }
}

/**
 * Render a boolean grid (true = lit) as board character lines: a filled block
 * for lit cells, blank for unlit. These flow into pagination as ordinary
 * character rows, so a pixelated image flips like any other content.
 */
export function gridToCharLines(grid: boolean[][], lit = BLOCK, unlit = BLANK): string[] {
  return grid.map((row) => row.map((cell) => (cell ? lit : unlit)).join(''))
}

// 4x4 Bayer matrix; values normalized to (0, 1) thresholds.
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
]

/** Average luminance of a pixel block, in [0, 1]. Transparent reads as black. */
function blockLuminance(src: PixelSource, x0: number, y0: number, x1: number, y1: number): number {
  let sum = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4
      const alpha = (src.data[i + 3] ?? 0) / 255
      const lum =
        0.2126 * (src.data[i] ?? 0) +
        0.7152 * (src.data[i + 1] ?? 0) +
        0.0722 * (src.data[i + 2] ?? 0)
      sum += (lum / 255) * alpha
      count++
    }
  }
  return count === 0 ? 0 : sum / count
}

/**
 * Downsample an RGBA buffer to a cols×rows grid of booleans
 * (true = lit/off-white cell, false = black).
 */
export function pixelsToGrid(src: PixelSource, options: ImageToGridOptions): boolean[][] {
  const { cols, rows, mode = 'bayer', threshold = 0.5 } = options
  if (cols < 1 || rows < 1) throw new Error(`invalid grid size ${cols}x${rows}`)
  if (src.data.length !== src.width * src.height * 4) {
    throw new Error('pixel buffer size does not match width*height*4')
  }

  const grid: boolean[][] = []
  for (let r = 0; r < rows; r++) {
    const row: boolean[] = []
    const y0 = Math.floor((r * src.height) / rows)
    const y1 = Math.max(y0 + 1, Math.floor(((r + 1) * src.height) / rows))
    for (let c = 0; c < cols; c++) {
      const x0 = Math.floor((c * src.width) / cols)
      const x1 = Math.max(x0 + 1, Math.floor(((c + 1) * src.width) / cols))
      const lum = blockLuminance(src, x0, y0, Math.min(x1, src.width), Math.min(y1, src.height))
      const cutoff = mode === 'bayer' ? ((BAYER_4X4[r % 4]?.[c % 4] ?? 0) + 0.5) / 16 : threshold
      row.push(lum >= cutoff)
    }
    grid.push(row)
  }
  return grid
}
