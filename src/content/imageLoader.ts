/**
 * The browser half of the image pipeline (brief §2): load an image, rasterize
 * it to a coarse two-tone grid via canvas, and cache the result as board
 * character lines. The pure sampling/dithering lives in engine/imageToGrid.ts;
 * here we only bridge <img> → canvas → RGBA buffer and cache per size.
 *
 * Images referenced in content are preloaded at startup, then the paginator
 * pulls their character lines synchronously through a resolver.
 */

import { gridDimensionsFor, pixelsToQuadrantRender } from '@/engine/imageToGrid'
import { IMAGE_MARKDOWN_RE, parseImageAttrs } from '@/engine/paginate'
import { contentByRoute } from '@/content/loader'
import { IMAGE_BLOCK_SIZE } from '@/config'
import type { ImageRender } from '@/engine/types'

/** Cache of rendered image lines + colors, keyed by source + target grid size. */
const cache = new Map<string, ImageRender>()

const key = (src: string, cols: number, rows: number) => `${src}@${cols}x${rows}`

function rasterize(img: HTMLImageElement, maxCols: number, maxRows: number): ImageRender {
  const { cols, rows } = gridDimensionsFor(
    img.naturalWidth || 1,
    img.naturalHeight || 1,
    // Coarser pixelation = fewer sampled cells per output cell.
    Math.max(1, Math.floor(maxCols / IMAGE_BLOCK_SIZE)),
    Math.max(1, Math.floor(maxRows / IMAGE_BLOCK_SIZE)),
  )
  // Sample at 2× the cell grid so each output cell owns a 2×2 block of
  // sub-pixels (rendered as a quadrant block glyph — 4 pixels per flap).
  const subCols = cols * 2
  const subRows = rows * 2
  const canvas = document.createElement('canvas')
  canvas.width = subCols
  canvas.height = subRows
  const ctx = canvas.getContext('2d')
  if (!ctx) return { lines: [] }
  ctx.drawImage(img, 0, 0, subCols, subRows)
  const { data } = ctx.getImageData(0, 0, subCols, subRows)
  return pixelsToQuadrantRender({ width: subCols, height: subRows, data }, cols, rows)
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

/** Rendered lines + colors for a cached image at this size, or null. */
export function imageRender(src: string, cols: number, rows: number): ImageRender | null {
  return cache.get(key(src, cols, rows)) ?? null
}

/** Load + rasterize every image referenced in content for the given grid size,
 *  populating the cache. Each image is preloaded at its own `{width=N}` request
 *  (capped to `cols`), matching the maxCols the paginator will actually resolve
 *  it at (engine/paginate.ts's renderImageBlock). Failures are swallowed (the
 *  image is simply skipped). */
export async function preloadContentImages(cols: number, rows: number): Promise<void> {
  if (typeof document === 'undefined') return
  const requests = new Map<string, { src: string; maxCols: number }>()
  for (const markdown of Object.values(contentByRoute)) {
    for (const match of markdown.matchAll(IMAGE_MARKDOWN_RE)) {
      const src = match[2]
      if (!src) continue
      const { width } = parseImageAttrs(match[3])
      const maxCols = width ? Math.min(width, cols) : cols
      requests.set(`${src}@${maxCols}`, { src, maxCols })
    }
  }
  await Promise.all(
    [...requests.values()].map(async ({ src, maxCols }) => {
      const cacheKey = key(src, maxCols, rows)
      if (cache.has(cacheKey)) return
      try {
        cache.set(cacheKey, rasterize(await loadImage(src), maxCols, rows))
      } catch {
        // Unreachable/undecodable image — leave it out of the cache.
      }
    }),
  )
}
