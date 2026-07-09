/**
 * Shared types for the engine modules. Everything in src/engine/ is plain,
 * framework-agnostic TypeScript — no Vue imports (CLAUDE.md).
 */

/** A column region within a single line, as [start, end) indices. */
export interface Span {
  start: number
  end: number
}

/** A link region within a single line, as [start, end) column indices. */
export interface LinkSpan extends Span {
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

/**
 * A reference to one slice of a full-resolution image, rendered via CSS
 * background-position/-size (a "sprite grid") rather than sampled into glyphs.
 * Every tile of one resolved image shares `cols`/`rows` (the tile-grid size);
 * `col`/`row` locate this cell within it. BoardCell computes the actual
 * background-position/-size from these (see engine/imageTile.ts).
 */
export interface ImageTileRef {
  src: string
  /** This cell's column/row within the image's tile grid. */
  col: number
  row: number
  /** Total tile-grid size (identical across every tile of one image). */
  cols: number
  rows: number
}

/** One board line of content (unpadded text plus metadata). */
export interface Line {
  text: string
  kind: LineKind
  /** Heading level (1–6); only present when kind === 'heading'. */
  level?: number
  links: LinkSpan[]
  /** Column spans rendered bold (`**text**` in markdown). Absent = none. */
  bold?: Span[]
  /** Column spans rendered italic (`*text*` in markdown). Absent = none. */
  italic?: Span[]
  /**
   * Per-column cell colors, for image lines only. Indexed by column, aligned
   * with `text` (including any centering pad, which is `null`). Absent on
   * ordinary text lines, which always use the default palette.
   */
  colors?: (CellColor | null)[]
  /**
   * Per-column image-tile references, for tile-slice image lines only. Same
   * per-column/`null`-padded contract as `colors`; a cell with a tile shows a
   * slice of the real image via CSS instead of a glyph.
   */
  tiles?: (ImageTileRef | null)[]
}

/** A pre-rendered image: quadrant/block character lines plus, when the image is
 *  rendered in color, a parallel grid of per-cell colors (CLAUDE.md rule 6).
 *  Tile-slice images instead carry a parallel grid of `tiles` (blank `lines`),
 *  each cell a slice of the real full-resolution image. */
export interface ImageRender {
  lines: string[]
  colors?: (CellColor | null)[][]
  tiles?: (ImageTileRef | null)[][]
}

/** A rectangle of board cells (top-left inclusive; width/height count cells).
 *  Used for border rings — see engine/border.ts's `borderRingPath`. */
export interface BorderRect {
  row: number
  col: number
  width: number
  height: number
}

/** One full screen of content: exactly `rows` lines. */
export interface Frame {
  lines: Line[]
  /**
   * Border rings authored with `{border=snake}`, in content-region coordinates
   * (row 0 = first content row). Present only on frames that show such an image;
   * the store offsets them to global rows and the border snake animates exactly
   * these rings (composables/useSnakeGame.ts) — a plain `{border}` never appears
   * here, so the snake is opt-in, not automatic on every border.
   */
  snakeRings?: BorderRect[]
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

/** A run of inline text, optionally a link and/or bold/italic, for the
 *  accessible parallel DOM. */
export interface InlineSegment {
  text: string
  href?: string
  bold?: boolean
  italic?: boolean
}

/** A page's real semantic content, rendered as hidden HTML for screen readers
 *  and page-search (independent of the split-flap grid layout). */
export interface SemanticBlock {
  kind: 'heading' | 'paragraph' | 'listItem'
  /** Heading level (1–6); only present when kind === 'heading'. */
  level?: number
  segments: InlineSegment[]
}
