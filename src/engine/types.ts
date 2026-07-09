/**
 * Shared types for the engine modules. Everything in src/engine/ is plain,
 * framework-agnostic TypeScript — no Vue imports (CLAUDE.md).
 */

/** A link region within a single line, as [start, end) column indices. */
export interface LinkSpan {
  start: number
  end: number
  /**
   * Omit to get the navy-CTA paint treatment without navigation — e.g. NavBar's
   * title block, which paints/flips like a link but doesn't go anywhere.
   */
  href?: string
  /**
   * Whether this link paints as a navy CTA. Defaults to true (content links).
   * Nav items set it false so they stay plain until hovered (NavBar drives it).
   */
  paint?: boolean
}

export type LineKind = 'body' | 'heading'

/**
 * Foreground/background color for a single colored (image) cell. The board's
 * default palette is off-white on black (CLAUDE.md rule 6); image cells are the
 * one exception — they carry their own colors so pixelated images render in
 * color. `null` in a colors array means "use the default palette".
 */
export interface CellColor {
  /** CSS color for the lit sub-pixels (the glyph's foreground). */
  fg: string
  /** CSS color behind the cell (the unlit sub-pixels). */
  bg: string
}

/** One board line of content (unpadded text plus metadata). */
export interface Line {
  text: string
  kind: LineKind
  /** Heading level (1–6); only present when kind === 'heading'. */
  level?: number
  links: LinkSpan[]
  /**
   * Per-column cell colors, for image lines only. Indexed by column, aligned
   * with `text` (including any centering pad, which is `null`). Absent on
   * ordinary text lines, which always use the default palette.
   */
  colors?: (CellColor | null)[]
}

/** A pre-rendered image: quadrant/block character lines plus, when the image is
 *  rendered in color, a parallel grid of per-cell colors (CLAUDE.md rule 6). */
export interface ImageRender {
  lines: string[]
  colors?: (CellColor | null)[][]
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

/** A run of inline text, optionally a link, for the accessible parallel DOM. */
export interface InlineSegment {
  text: string
  href?: string
}

/** A page's real semantic content, rendered as hidden HTML for screen readers
 *  and page-search (independent of the split-flap grid layout). */
export interface SemanticBlock {
  kind: 'heading' | 'paragraph' | 'listItem'
  /** Heading level (1–6); only present when kind === 'heading'. */
  level?: number
  segments: InlineSegment[]
}
