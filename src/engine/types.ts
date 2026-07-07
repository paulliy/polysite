/**
 * Shared types for the engine modules. Everything in src/engine/ is plain,
 * framework-agnostic TypeScript — no Vue imports (CLAUDE.md).
 */

/** A link region within a single line, as [start, end) column indices. */
export interface LinkSpan {
  start: number
  end: number
  href: string
}

export type LineKind = 'body' | 'heading'

/** One board line of content (unpadded text plus metadata). */
export interface Line {
  text: string
  kind: LineKind
  /** Heading level (1–6); only present when kind === 'heading'. */
  level?: number
  links: LinkSpan[]
}

/** One full screen of content: exactly `rows` lines. */
export interface Frame {
  lines: Line[]
}

/** A single cell that must flip, with its ripple delay. */
export interface CellChange {
  row: number
  col: number
  from: string
  to: string
  delayMs: number
}

/** RGBA pixel buffer — structurally compatible with canvas ImageData. */
export interface PixelSource {
  width: number
  height: number
  data: Uint8ClampedArray
}
