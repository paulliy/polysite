/**
 * Image → two-tone grid approximation (brief §2): sample pixel brightness per
 * character cell, then threshold or ordered-dither down to on (off-white) /
 * off (black). This module is the pure half — it consumes an RGBA buffer.
 * The canvas glue that produces that buffer from an <img> lives in
 * content/imageLoader.ts (browser-only).
 */

import type { CellColor, ImageRender, PixelSource } from './types'
import { BLANK, BLOCK, QUADRANT_BY_MASK } from './characterSet'

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

/** Average color + luminance of a pixel block. Transparent reads as black.
 *  Channels are premultiplied by alpha so transparent pixels darken toward the
 *  black board rather than tinting the average. */
interface BlockSample {
  r: number
  g: number
  b: number
  /** Perceptual luminance in [0, 1]. */
  lum: number
}

function blockColor(src: PixelSource, x0: number, y0: number, x1: number, y1: number): BlockSample {
  let rs = 0
  let gs = 0
  let bs = 0
  let count = 0
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * src.width + x) * 4
      const alpha = (src.data[i + 3] ?? 0) / 255
      rs += (src.data[i] ?? 0) * alpha
      gs += (src.data[i + 1] ?? 0) * alpha
      bs += (src.data[i + 2] ?? 0) * alpha
      count++
    }
  }
  if (count === 0) return { r: 0, g: 0, b: 0, lum: 0 }
  const r = rs / count
  const g = gs / count
  const b = bs / count
  return { r, g, b, lum: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 }
}

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

// ---------------------------------------------------------------------------
// Colored, quadrant-resolution rendering
// ---------------------------------------------------------------------------

/**
 * Sub-pixels within a cell whose luminance spread is below this are treated as
 * one flat region (a full block of their average color) instead of being split
 * into a quadrant shape — otherwise sensor/JPEG noise on flat areas speckles
 * into random half-lit glyphs.
 */
const CELL_CONTRAST_EPS = 0.06

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)))
const rgb = (s: BlockSample) => `rgb(${clamp255(s.r)}, ${clamp255(s.g)}, ${clamp255(s.b)})`

/** Average a set of block samples (used to fold lit/unlit clusters into one color). */
function averageSamples(samples: BlockSample[]): BlockSample {
  if (samples.length === 0) return { r: 0, g: 0, b: 0, lum: 0 }
  const sum = samples.reduce(
    (acc, s) => ({ r: acc.r + s.r, g: acc.g + s.g, b: acc.b + s.b, lum: acc.lum + s.lum }),
    { r: 0, g: 0, b: 0, lum: 0 },
  )
  const n = samples.length
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n, lum: sum.lum / n }
}

/**
 * Render an RGBA buffer to a colored, quadrant-resolution image: `rows` lines of
 * `cols` block glyphs, plus a matching grid of per-cell {fg, bg} colors. The
 * source is expected to be sampled at 2×cols × 2×rows so each output cell owns a
 * 2×2 block of sub-pixels (bit order TL, TR, BL, BR — see QUADRANT_BY_MASK).
 * Within a cell the brighter sub-pixels light the glyph (painted `fg`) and the
 * darker ones fall to the background (`bg`), so one flap carries two colors and
 * an edge shape.
 */
export function pixelsToQuadrantRender(src: PixelSource, cols: number, rows: number): ImageRender {
  if (cols < 1 || rows < 1) throw new Error(`invalid grid size ${cols}x${rows}`)
  if (src.data.length !== src.width * src.height * 4) {
    throw new Error('pixel buffer size does not match width*height*4')
  }

  const subCols = cols * 2
  const subRows = rows * 2
  const lines: string[] = []
  const colors: (CellColor | null)[][] = []

  // Sub-pixel offsets in bit order: top-left, top-right, bottom-left, bottom-right.
  const OFFSETS = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ] as const

  for (let r = 0; r < rows; r++) {
    let line = ''
    const rowColors: (CellColor | null)[] = []
    for (let c = 0; c < cols; c++) {
      const subs = OFFSETS.map(([dy, dx]) => {
        const sc = c * 2 + dx
        const sr = r * 2 + dy
        const x0 = Math.floor((sc * src.width) / subCols)
        const x1 = Math.max(x0 + 1, Math.floor(((sc + 1) * src.width) / subCols))
        const y0 = Math.floor((sr * src.height) / subRows)
        const y1 = Math.max(y0 + 1, Math.floor(((sr + 1) * src.height) / subRows))
        return blockColor(src, x0, y0, Math.min(x1, src.width), Math.min(y1, src.height))
      })

      const lums = subs.map((s) => s.lum)
      const minL = Math.min(...lums)
      const maxL = Math.max(...lums)

      let mask: number
      let fg: BlockSample
      let bg: BlockSample
      if (maxL - minL < CELL_CONTRAST_EPS) {
        // Flat cell: one solid block of the average color.
        mask = 0b1111
        fg = averageSamples(subs)
        bg = { r: 0, g: 0, b: 0, lum: 0 }
      } else {
        const threshold = (minL + maxL) / 2
        mask = 0
        const lit: BlockSample[] = []
        const unlit: BlockSample[] = []
        subs.forEach((s, bit) => {
          if (s.lum >= threshold) {
            mask |= 1 << bit
            lit.push(s)
          } else {
            unlit.push(s)
          }
        })
        fg = averageSamples(lit)
        bg = averageSamples(unlit)
      }

      line += QUADRANT_BY_MASK[mask] ?? BLANK
      rowColors.push(mask === 0 ? null : { fg: rgb(fg), bg: rgb(bg) })
    }
    lines.push(line)
    colors.push(rowColors)
  }

  return { lines, colors }
}
