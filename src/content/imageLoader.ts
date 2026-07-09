/**
 * The browser half of the image pipeline (brief §2): load an image and resolve
 * it to a tile-slice render — each board cell shows a slice of the real
 * full-resolution image via CSS background-position/-size. The pure
 * grid/slice math lives in engine/imageTile.ts; here we only bridge <img> →
 * intrinsic size and cache per requested grid size.
 *
 * Images referenced in content are preloaded at startup (which also forces the
 * decode, so the bitmap is ready before any cell references its URL), then the
 * paginator pulls their tile grids synchronously through a resolver.
 */

import { imageToTileRender } from '@/engine/imageTile'
import { IMAGE_MARKDOWN_RE, imageRequestSize, parseImageAttrs } from '@/engine/paginate'
import { contentByRoute } from '@/content/loader'
import type { ImageRender } from '@/engine/types'

/** Cache of rendered image tile grids, keyed by source + target grid size. */
const cache = new Map<string, ImageRender>()

const key = (src: string, cols: number, rows: number) => `${src}@${cols}x${rows}`

function resolveTiles(
  img: HTMLImageElement,
  src: string,
  maxCols: number,
  maxRows: number,
): ImageRender {
  return imageToTileRender(src, img.naturalWidth || 1, img.naturalHeight || 1, maxCols, maxRows)
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  img.src = src
  await img.decode()
  return img
}

/** Tile grid for a cached image at this size, or null. */
export function imageRender(src: string, cols: number, rows: number): ImageRender | null {
  return cache.get(key(src, cols, rows)) ?? null
}

/** Load + resolve every image referenced in content for the given grid size,
 *  populating the cache. Each image is preloaded at its own attrs' request —
 *  `{width=N}` capped to `cols`, minus the `{border}` ring inset — via the same
 *  `imageRequestSize` the paginator resolves it with (engine/paginate.ts's
 *  renderImageBlock), so cache keys always match. Failures are swallowed (the
 *  image is simply skipped). */
export async function preloadContentImages(cols: number, rows: number): Promise<void> {
  if (typeof document === 'undefined') return
  const requests = new Map<string, { src: string; maxCols: number; maxRows: number }>()
  for (const markdown of Object.values(contentByRoute)) {
    for (const match of markdown.matchAll(IMAGE_MARKDOWN_RE)) {
      const src = match[2]
      if (!src) continue
      const size = imageRequestSize(parseImageAttrs(match[3]), cols, rows)
      requests.set(key(src, size.cols, size.rows), { src, maxCols: size.cols, maxRows: size.rows })
    }
  }
  await Promise.all(
    [...requests.values()].map(async ({ src, maxCols, maxRows }) => {
      const cacheKey = key(src, maxCols, maxRows)
      if (cache.has(cacheKey)) return
      try {
        cache.set(cacheKey, resolveTiles(await loadImage(src), src, maxCols, maxRows))
      } catch {
        // Unreachable/undecodable image — leave it out of the cache.
      }
    }),
  )
}
