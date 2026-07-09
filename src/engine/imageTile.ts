/**
 * Tile-slice image rendering (CLAUDE.md rule 6): instead of sampling a photo
 * into two-tone quadrant glyphs (imageToGrid.ts), each flap cell shows a slice
 * of the *real* full-resolution image via CSS background-image/-position/-size
 * — the classic percentage sprite-grid technique. Because the board's cell size
 * is a pure CSS `calc()` value, the slicing math is entirely CSS and needs no
 * JS recompute on resize.
 *
 * Plain, framework/DOM-free TypeScript (CLAUDE.md keeps engine/ unit-testable):
 * `imageToTileRender` takes the image's intrinsic dimensions as plain numbers,
 * not an <img>, so the browser glue (content/imageLoader.ts) only has to read
 * naturalWidth/naturalHeight and pass them in.
 */

import type { ImageRender, ImageTileRef } from './types'
import { BLANK } from './characterSet'
import { gridDimensionsFor } from './imageToGrid'

/**
 * Resolve an image's tile grid from its natural size — the tile-mode
 * counterpart to `pixelsToQuadrantRender`, but needing no pixel buffer, just
 * the intrinsic dimensions and the requested cell bounds. `lines` are blank
 * (the visible content is the CSS background), and `tiles` locates each cell in
 * a `cols`×`rows` sprite grid over the source image.
 */
export function imageToTileRender(
  src: string,
  naturalWidth: number,
  naturalHeight: number,
  maxCols: number,
  maxRows: number,
): ImageRender {
  const { cols, rows } = gridDimensionsFor(naturalWidth || 1, naturalHeight || 1, maxCols, maxRows)
  const lines = Array.from({ length: rows }, () => BLANK.repeat(cols))
  const tiles: (ImageTileRef | null)[][] = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col): ImageTileRef => ({ src, col, row, cols, rows })),
  )
  return { lines, tiles }
}

/**
 * The CSS sprite-grid math for one tile: scale the image so the whole grid
 * spans `cols`×`rows` cells, then position it so this cell shows slice
 * (col, row). The browser resolves a background-position percentage as
 * (containerSize − imageSize) × pct/100, so `col/(cols-1)*100%` lands cell
 * `col` exactly. Division is guarded for a 1-wide / 1-tall grid.
 */
export function tileBackgroundStyle(tile: ImageTileRef): {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
} {
  const { src, col, row, cols, rows } = tile
  const posX = cols > 1 ? (col / (cols - 1)) * 100 : 0
  const posY = rows > 1 ? (row / (rows - 1)) * 100 : 0
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `${cols * 100}% ${rows * 100}%`,
    backgroundPosition: `${posX}% ${posY}%`,
  }
}
