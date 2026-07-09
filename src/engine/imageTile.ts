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
 * The CSS sprite-grid math for one tile. Rather than a percentage
 * `background-size` (which the browser rasterizes independently per cell, so
 * fractional cell sizes leave adjacent slices at mismatched scales — visible
 * seams), the image is sized and positioned in **grid-absolute units** off the
 * shared `--cell-w`/`--cell-h` custom properties: every cell scales the image
 * to the exact same `cols×rows`-cell box and walks the position left/up by this
 * cell's (col, row), so all slices reference one identical scaled image and
 * line up to the sub-pixel.
 */
export function tileBackgroundStyle(tile: ImageTileRef): {
  backgroundImage: string
  backgroundSize: string
  backgroundPosition: string
} {
  const { src, col, row, cols, rows } = tile
  return {
    backgroundImage: `url("${src}")`,
    backgroundSize: `calc(var(--cell-w) * ${cols}) calc(var(--cell-h) * ${rows})`,
    backgroundPosition: `calc(var(--cell-w) * ${-col}) calc(var(--cell-h) * ${-row})`,
  }
}
