/**
 * The browser half of the image pipeline (brief §2): load an image, rasterize
 * it to a coarse two-tone grid via canvas, and cache the result as board
 * character lines. The pure sampling/dithering lives in engine/imageToGrid.ts;
 * here we only bridge <img> → canvas → RGBA buffer and cache per size.
 *
 * Images referenced in content are preloaded at startup, then the paginator
 * pulls their character lines synchronously through a resolver.
 */

import { gridDimensionsFor, gridToCharLines, pixelsToGrid } from '@/engine/imageToGrid'
import { contentByRoute } from '@/content/loader'
import { IMAGE_BLOCK_SIZE } from '@/config'

/** Cache of rendered character lines, keyed by source + target grid size. */
const cache = new Map<string, string[]>()

const key = (src: string, cols: number, rows: number) => `${src}@${cols}x${rows}`

const IMAGE_SRC_RE = /!\[[^\]]*\]\(([^)\s]+)\)/g

function rasterize(img: HTMLImageElement, maxCols: number, maxRows: number): string[] {
  const { cols, rows } = gridDimensionsFor(
    img.naturalWidth || 1,
    img.naturalHeight || 1,
    // Coarser pixelation = fewer sampled cells per output cell.
    Math.max(1, Math.floor(maxCols / IMAGE_BLOCK_SIZE)),
    Math.max(1, Math.floor(maxRows / IMAGE_BLOCK_SIZE)),
  )
  const canvas = document.createElement('canvas')
  canvas.width = cols
  canvas.height = rows
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, cols, rows)
  const { data } = ctx.getImageData(0, 0, cols, rows)
  const grid = pixelsToGrid({ width: cols, height: rows, data }, { cols, rows, mode: 'bayer' })
  return gridToCharLines(grid)
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

/** Rendered character lines for a cached image at this size, or null. */
export function imageLines(src: string, cols: number, rows: number): string[] | null {
  return cache.get(key(src, cols, rows)) ?? null
}

/** Load + rasterize every image referenced in content for the given grid size,
 *  populating the cache. Failures are swallowed (the image is simply skipped). */
export async function preloadContentImages(cols: number, rows: number): Promise<void> {
  if (typeof document === 'undefined') return
  const srcs = new Set<string>()
  for (const markdown of Object.values(contentByRoute)) {
    for (const match of markdown.matchAll(IMAGE_SRC_RE)) {
      if (match[1]) srcs.add(match[1])
    }
  }
  await Promise.all(
    [...srcs].map(async (src) => {
      const cacheKey = key(src, cols, rows)
      if (cache.has(cacheKey)) return
      try {
        cache.set(cacheKey, rasterize(await loadImage(src), cols, rows))
      } catch {
        // Unreachable/undecodable image — leave it out of the cache.
      }
    }),
  )
}
