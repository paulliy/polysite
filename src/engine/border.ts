/**
 * Optional one-cell border ring around a pixelated content image, authored as
 * a bare `border` flag in the image's `{...}` attribute block (see
 * paginate.ts's `parseImageAttrs`). The ring is drawn in light box-drawing
 * faces on the default palette — the border is board chrome, not image, so it
 * carries no color (CLAUDE.md rule 6).
 *
 * This module also owns the ring's *geometry*: `borderRingPath` walks a ring's
 * perimeter clockwise into an ordered cell list. That ordered walk is the track
 * the hover "snake" travels (engine/snake.ts + composables/useSnakeGame.ts) —
 * keeping ring glyphs, construction, and traversal in one home. The rings the
 * snake animates come from the paginator (opt-in `{border=snake}`, threaded via
 * `Frame.snakeRings`), not from scanning the board.
 */

import type { BorderRect, ImageRender } from './types'
import { BORDER_GLYPHS } from './characterSet'

/**
 * Grow a per-cell parallel grid (colors or tiles) by the one-cell border ring:
 * a `fill` (null = default palette / no tile) all around, interior rows shifted
 * one column in. `undefined` in → `undefined` out, so a render without the
 * channel keeps it absent. Shared by every parallel image channel so a new one
 * (e.g. tiles) rings identically to colors.
 */
function padRing<T>(rows: (T | null)[][] | undefined, width: number): (T | null)[][] | undefined {
  if (!rows) return undefined
  return [
    Array<T | null>(width + 2).fill(null),
    ...rows.map((row) => [null, ...row, null]),
    Array<T | null>(width + 2).fill(null),
  ]
}

/**
 * Wrap a resolved image render in a one-cell box-drawing ring. The result is
 * 2 cells wider and 2 rows taller than the input; callers account for that by
 * resolving the image itself 2 cells smaller (see paginate.ts's
 * `imageRequestSize`). Border cells get `null` color/tile entries (default
 * palette, no image slice); an empty render passes through untouched.
 */
export function withBorder(render: ImageRender): ImageRender {
  const width = render.lines[0]?.length ?? 0
  if (width === 0) return render
  const { horizontal, vertical, topLeft, topRight, bottomLeft, bottomRight } = BORDER_GLYPHS
  const rule = horizontal.repeat(width)
  const lines = [
    topLeft + rule + topRight,
    ...render.lines.map((line) => vertical + line + vertical),
    bottomLeft + rule + bottomRight,
  ]
  return {
    lines,
    colors: padRing(render.colors, width),
    tiles: padRing(render.tiles, width),
  }
}

/** A single ring cell, in the same coordinate space as the `BorderRect`. */
export interface RingCell {
  row: number
  col: number
}

/**
 * Walk a ring's perimeter clockwise from its top-left corner into an ordered
 * list of cells (top edge L→R, right edge T→B, bottom edge R→L, left edge B→T),
 * each cell listed exactly once. Length is `2 * (width + height) - 4`. This is
 * the closed track the snake advances along, one cell per step.
 */
export function borderRingPath(rect: BorderRect): RingCell[] {
  const { row: top, col: left, width, height } = rect
  const bottom = top + height - 1
  const right = left + width - 1
  const path: RingCell[] = []
  for (let col = left; col <= right; col++) path.push({ row: top, col })
  for (let row = top + 1; row <= bottom; row++) path.push({ row, col: right })
  for (let col = right - 1; col >= left; col--) path.push({ row: bottom, col })
  for (let row = bottom - 1; row >= top + 1; row--) path.push({ row, col: left })
  return path
}
