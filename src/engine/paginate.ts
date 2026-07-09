/**
 * Markdown → word-wrapped lines → paginated frames (brief §2, CLAUDE.md #10).
 *
 * Book-style pagination: lines flow continuously and are sliced into frames of
 * `rows` lines — paragraphs split across frame boundaries freely. The only
 * page-level nicety is that a frame never *starts* with a blank separator line.
 *
 * Supported markdown subset for v1: #–###### headings, paragraphs, `-`/`*`
 * list items, [text](href) links, bold/italic emphasis (`**strong**`, one
 * `*` for italic — rendered as a font-weight/font-style change per cell, see
 * `BoardCell.vue`'s `.face--bold`/`.face--italic`; not a real mechanical
 * capability). Underscore emphasis (a single or doubled `_`) isn't
 * recognized, so identifiers like `snake_case` render literally. Nesting
 * emphasis inside a link (or vice versa) isn't supported — whichever wraps
 * outermost wins and the inner markers render as literal characters;
 * backtick-delimited code spans are still just stripped, with no distinct
 * rendering. Images (![alt](src))
 * are parsed out and rendered via the injected `image` resolver; an optional
 * trailing `{width=N align=left|center|right border}` attribute block sizes,
 * positions, and frames them — see `parseImageAttrs`. `border=snake` makes the
 * ring a hover-animated snake border (opt-in; recorded per frame as
 * `Frame.snakeRings` for composables/useSnakeGame.ts) rather than a plain ring. Headings and paragraphs
 * support the same trailing `{align=left|center|right}` attribute (no width/
 * border) on their last source line, to center/right-align the wrapped text —
 * see `stripTextAlign`.
 */

import type {
  BorderRect,
  CellColor,
  Frame,
  ImageRender,
  ImageTileRef,
  InlineSegment,
  Line,
  LinkSpan,
  SemanticBlock,
  Span,
} from './types'
import { BLANK, expandIconShortcodes, isIcon, normalizeChar, normalizeText } from './characterSet'
import { withBorder } from './border'
import { ICON_LABELS } from './icons'

export interface PaginateOptions {
  /** Content-region width in character cells. */
  cols: number
  /** Content-region height in lines (grid rows minus nav rows). */
  rows: number
  /**
   * Resolves an image `src` to its pre-rendered pixelated lines + per-cell
   * colors, or null if it isn't ready. `maxCols`/`maxRows` bound the render —
   * a `{width=N}` request, minus the ring inset when `{border}` is set (see
   * `imageRequestSize`); omitted/undefined means the full content region.
   * Injected so the engine stays pure — the browser canvas pipeline lives in
   * content/imageLoader.ts.
   */
  image?: (src: string, maxCols?: number, maxRows?: number) => ImageRender | null
}

const BLANK_LINE: Line = { text: '', kind: 'body', links: [] }

export type ImageAlign = 'left' | 'center' | 'right'

export interface ImageAttrs {
  /** Requested image width in character cells; unset renders full width. */
  width?: number
  align: ImageAlign
  /** Draw a one-cell box-drawing ring around the image (engine/border.ts).
   *  `width` stays the total footprint — the image renders 2 cells smaller. */
  border?: boolean
  /**
   * The ring is a "snake" border: while hovered, a snake animation travels it
   * (composables/useSnakeGame.ts). Authored as `{border=snake}`; implies
   * `border`. A bare `{border}` is a plain static ring with no snake.
   */
  snake?: boolean
}

const IMAGE_ATTR_RE = /(\w+)\s*=\s*(\S+)/g
/** The bare `border` flag — a standalone word, not a `key=value` pair (that
 *  form, `border=snake`, is handled in the key/value loop below). */
const BORDER_FLAG_RE = /(?:^|\s)border(?:\s|$)/

/** Parse a `width=N align=left|center|right border|border=snake` attribute
 *  string (the contents of an image's trailing `{...}`). Unrecognized/malformed
 *  keys are ignored; align defaults to 'center' to match the pre-existing
 *  centering behavior. */
export function parseImageAttrs(raw: string | undefined): ImageAttrs {
  const attrs: ImageAttrs = { align: 'center' }
  if (!raw) return attrs
  if (BORDER_FLAG_RE.test(raw)) attrs.border = true
  for (const [, key, value] of raw.matchAll(IMAGE_ATTR_RE)) {
    if (key === 'width') {
      const n = Number.parseInt(value ?? '', 10)
      if (Number.isFinite(n) && n > 0) attrs.width = n
    } else if (key === 'align' && (value === 'left' || value === 'center' || value === 'right')) {
      attrs.align = value
    } else if (key === 'border') {
      // `border=snake` opts the ring into the snake animation; any other value
      // (e.g. `border=plain`) is just a ring.
      attrs.border = true
      if (value === 'snake') attrs.snake = true
    }
  }
  return attrs
}

/**
 * The grid size an image should be rasterized/resolved at, given its attrs
 * and the content region. A `{border}` ring takes one cell on every side, so
 * a bordered image resolves 2 cells narrower and shorter — `width` (and the
 * content region) stays the total footprint including the ring. Shared with
 * content/imageLoader.ts so preloading rasterizes at exactly the size the
 * paginator will look up.
 */
export function imageRequestSize(
  attrs: Pick<ImageAttrs, 'width' | 'border'>,
  cols: number,
  rows: number,
): { cols: number; rows: number } {
  const inset = attrs.border ? 2 : 0
  const maxCols = attrs.width ? Math.min(attrs.width, cols) : cols
  return { cols: Math.max(1, maxCols - inset), rows: Math.max(1, rows - inset) }
}

/**
 * Matches a markdown image with an optional trailing `{...}` attribute block,
 * anywhere in a string (global). Shared between this module's per-line block
 * parser and content/imageLoader.ts, which scans whole documents to preload
 * every referenced image at its requested size.
 */
export const IMAGE_MARKDOWN_RE = /!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?/g

/** Matches a trailing `{...}` attribute block at the end of a heading's or
 *  paragraph's last source line (image attrs are matched separately by
 *  `IMAGE_RE`/`IMAGE_MARKDOWN_RE`, which anchor on the `![...]` syntax itself). */
const TRAILING_ALIGN_RE = /\{([^}]*)\}\s*$/

/**
 * Strip a trailing `{align=left|center|right}` attribute off a line of plain
 * text, mirroring the image attribute syntax above (minus width/border, which
 * only make sense for images). Defaults to 'left' — the pre-existing behavior
 * — when no attribute is present.
 */
function stripTextAlign(raw: string): { text: string; align: ImageAlign } {
  const match = TRAILING_ALIGN_RE.exec(raw)
  if (!match) return { text: raw, align: 'left' }
  const { align } = parseImageAttrs(match[1])
  return { text: raw.slice(0, match.index).trimEnd(), align }
}

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

interface Block {
  kind: 'heading' | 'paragraph' | 'listItem' | 'image'
  /** Inline text, or (for image blocks) the alt text. */
  text: string
  level?: number
  /** Image source (image blocks only). */
  src?: string
  /** Requested render width in cells (image blocks only); unset = full width. */
  width?: number
  /** Horizontal placement (image, heading, and paragraph blocks). */
  align?: ImageAlign
  /** One-cell border ring (image blocks only). */
  border?: boolean
  /** The border ring is a hover-animated snake ring (`{border=snake}`). */
  snake?: boolean
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_ITEM_RE = /^[-*]\s+(.*)$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)(?:\{([^}]*)\})?$/

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  // The list item still accepting continuation lines, if any.
  let openListItem: Block | null = null

  const flush = () => {
    if (paragraph.length > 0) {
      const lastIdx = paragraph.length - 1
      const { text, align } = stripTextAlign(paragraph[lastIdx]!)
      paragraph[lastIdx] = text
      blocks.push({ kind: 'paragraph', text: paragraph.join(' '), align })
      paragraph = []
    }
  }

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (line === '') {
      flush()
      openListItem = null
      continue
    }
    const image = IMAGE_RE.exec(line)
    if (image) {
      flush()
      openListItem = null
      const attrs = parseImageAttrs(image[3])
      blocks.push({
        kind: 'image',
        text: image[1] ?? '',
        src: image[2] ?? '',
        width: attrs.width,
        align: attrs.align,
        border: attrs.border,
        snake: attrs.snake,
      })
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flush()
      openListItem = null
      const { text, align } = stripTextAlign(heading[2] ?? '')
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text, align })
      continue
    }
    const listItem = LIST_ITEM_RE.exec(line)
    if (listItem) {
      flush()
      openListItem = { kind: 'listItem', text: listItem[1] ?? '' }
      blocks.push(openListItem)
      continue
    }
    if (openListItem) {
      // Indented wrap of the item above (a "lazy" continuation line).
      openListItem.text += ' ' + line
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks
}

// ---------------------------------------------------------------------------
// Inline parsing: links, bold/italic spans out; leftover markers stripped
// ---------------------------------------------------------------------------

interface FlatText {
  text: string
  links: LinkSpan[] // offsets into `text`
  bold: Span[]
  italic: Span[]
}

/**
 * One inline token per match: `**bold**`, a lone `*italic*`, a `[label](href)`
 * link, or a `` `code` `` span (stripped, not styled — see the module
 * docstring). Bold is tried before italic so `**x**` isn't mistaken for
 * `*` + `*x*` + `*`; because each alternative starts on a distinct literal
 * character, none of the others can race it for the same starting position —
 * whichever token's delimiter appears earliest in the source simply consumes
 * up to its own closing delimiter, so overlapping/nested markup isn't
 * recognized (see the module docstring).
 */
const INLINE_TOKEN_RE = /\*\*(.+?)\*\*|\*(.+?)\*|\[([^\]]*)\]\(([^)\s]+)\)|`([^`]+?)`/g

/** Leftover/unmatched markup characters (an opening marker with no partner,
 *  or content this "small subset" parser doesn't otherwise recognize) render
 *  as nothing rather than stray asterisks/backticks. */
function stripStrayMarkers(text: string): string {
  return text.replace(/\*\*|\*|`/g, '')
}

/** Collapse runs of whitespace and resolve links/emphasis to plain text plus
 *  column spans (bold/italic/links) into that text. */
function parseInline(raw: string): FlatText {
  const source = expandIconShortcodes(normalizeText(raw)).replace(/\s+/g, ' ').trim()
  let text = ''
  const links: LinkSpan[] = []
  const bold: Span[] = []
  const italic: Span[] = []
  let lastIndex = 0

  for (const match of source.matchAll(INLINE_TOKEN_RE)) {
    text += stripStrayMarkers(source.slice(lastIndex, match.index))
    const [, boldText, italicText, linkLabel, linkHref, codeText] = match
    if (boldText !== undefined) {
      const clean = stripStrayMarkers(boldText)
      if (clean.length > 0) {
        bold.push({ start: text.length, end: text.length + clean.length })
        text += clean
      }
    } else if (italicText !== undefined) {
      const clean = stripStrayMarkers(italicText)
      if (clean.length > 0) {
        italic.push({ start: text.length, end: text.length + clean.length })
        text += clean
      }
    } else if (linkLabel !== undefined) {
      const clean = stripStrayMarkers(linkLabel)
      if (clean.length > 0) {
        links.push({ start: text.length, end: text.length + clean.length, href: linkHref ?? '' })
        text += clean
      }
    } else if (codeText !== undefined) {
      text += stripStrayMarkers(codeText)
    }
    lastIndex = match.index + match[0].length
  }
  text += stripStrayMarkers(source.slice(lastIndex))
  return { text, links, bold, italic }
}

// ---------------------------------------------------------------------------
// Semantic blocks (accessible parallel DOM — CLAUDE.md #11)
// ---------------------------------------------------------------------------

/** Icon faces are decorative on the board; drop them from readable text. */
function stripIcons(text: string): string {
  return [...text].map((ch) => (isIcon(ch) ? '' : ch)).join('')
}

/** Fallback readable text for an icon-only link: its icons' accessible labels. */
function iconLabelsOf(text: string): string {
  return [...text]
    .filter(isIcon)
    .map((ch) => ICON_LABELS[ch] ?? '')
    .join(' ')
    .trim()
}

/** A link, bold, or italic span, tagged so `toSegments` can render it —
 *  `parseInline` never produces overlapping spans (each source position is
 *  consumed by at most one token), so sorting by `start` alone orders them. */
interface TaggedSpan extends Span {
  href?: string
  bold?: boolean
  italic?: boolean
}

/** Split flat text + link/bold/italic spans into an ordered run of segments,
 *  with decorative icon faces resolved for assistive tech. */
function toSegments(flat: FlatText): InlineSegment[] {
  const spans: TaggedSpan[] = [
    ...flat.links.map((l): TaggedSpan => ({ start: l.start, end: l.end, href: l.href })),
    ...flat.bold.map((s): TaggedSpan => ({ start: s.start, end: s.end, bold: true })),
    ...flat.italic.map((s): TaggedSpan => ({ start: s.start, end: s.end, italic: true })),
  ].sort((a, b) => a.start - b.start)

  const segments: InlineSegment[] = []
  let cursor = 0
  const pushText = (raw: string) => {
    // Collapse whitespace left by removed icons, but keep inter-segment spacing.
    const text = stripIcons(raw).replace(/\s+/g, ' ')
    if (text.trim()) segments.push({ text })
  }
  for (const span of spans) {
    if (span.start > cursor) pushText(flat.text.slice(cursor, span.start))
    const raw = flat.text.slice(span.start, span.end)
    const cleaned = stripIcons(raw).replace(/\s+/g, ' ').trim()
    segments.push({
      text: cleaned || iconLabelsOf(raw),
      ...(span.href !== undefined ? { href: span.href } : {}),
      ...(span.bold ? { bold: true } : {}),
      ...(span.italic ? { italic: true } : {}),
    })
    cursor = span.end
  }
  if (cursor < flat.text.length) pushText(flat.text.slice(cursor))
  return segments
}

/**
 * The full page as real semantic blocks (headings, paragraphs, list items with
 * inline links) — the source for the visually-hidden parallel DOM that screen
 * readers and Ctrl+F use. Unlike `paginateMarkdown`, this is layout-free: it's
 * the whole document, not sliced into grid frames.
 */
export function toSemanticBlocks(markdown: string): SemanticBlock[] {
  const out: SemanticBlock[] = []
  for (const block of parseBlocks(markdown)) {
    if (block.kind === 'image') {
      // Represent the image by its alt text so screen readers still get it.
      const alt = block.text.trim()
      if (alt) out.push({ kind: 'paragraph', segments: [{ text: alt }] })
      continue
    }
    out.push({
      kind: block.kind,
      ...(block.level !== undefined ? { level: block.level } : {}),
      segments: toSegments(parseInline(block.text)),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Word wrapping (link spans tracked through the wrap)
// ---------------------------------------------------------------------------

interface Word {
  text: string
  /** Offset of this word in the flat source text. */
  src: number
}

function splitWords(flat: FlatText, width: number): Word[] {
  const words: Word[] = []
  const re = /\S+/g
  for (const match of flat.text.matchAll(re)) {
    // Hard-break words longer than the line width.
    for (let i = 0; i < match[0].length; i += width) {
      words.push({ text: match[0].slice(i, i + width), src: match.index + i })
    }
  }
  return words
}

/**
 * Re-anchor spans (in flat source-text offsets) onto a wrapped line's own
 * columns, given the words placed on that line — shared by links and the
 * bold/italic spans below, since all three are just [start,end) ranges over
 * the same source text. Adjacent same-group spans separated only by the
 * space between words are merged back into one.
 */
function mapSpansToLine<S extends Span>(
  placed: Array<Word & { col: number }>,
  spans: S[],
  sameGroup: (a: S, b: S) => boolean,
): S[] {
  const mapped: S[] = []
  for (const word of placed) {
    const wordEnd = word.src + word.text.length
    for (const span of spans) {
      const start = Math.max(span.start, word.src)
      const end = Math.min(span.end, wordEnd)
      if (start < end) {
        mapped.push({ ...span, start: word.col + (start - word.src), end: word.col + (end - word.src) })
      }
    }
  }
  const merged: S[] = []
  for (const span of mapped) {
    const prev = merged[merged.length - 1]
    if (prev && sameGroup(prev, span) && span.start - prev.end <= 1) {
      prev.end = span.end
    } else {
      merged.push({ ...span })
    }
  }
  return merged
}

function lineLinks(placed: Array<Word & { col: number }>, links: LinkSpan[]): LinkSpan[] {
  return mapSpansToLine(placed, links, (a, b) => a.href === b.href)
}

/** Bold/italic spans have no distinguishing field beyond position, so any two
 *  adjacent spans of the same array are the same "group" and merge. */
function lineStyleSpans(placed: Array<Word & { col: number }>, spans: Span[]): Span[] {
  return mapSpansToLine(placed, spans, () => true)
}

function wrapFlatText(
  flat: FlatText,
  width: number,
  kind: Line['kind'],
  level?: number,
): Line[] {
  const words = splitWords(flat, width)
  if (words.length === 0) return []

  const lines: Line[] = []
  let placed: Array<Word & { col: number }> = []
  let cursor = 0

  const flushLine = () => {
    if (placed.length === 0) return
    const text = placed.map((w, i) => (i === 0 ? w.text : ' ' + w.text)).join('')
    const bold = lineStyleSpans(placed, flat.bold)
    const italic = lineStyleSpans(placed, flat.italic)
    lines.push({
      text,
      kind,
      level,
      links: lineLinks(placed, flat.links),
      ...(bold.length > 0 ? { bold } : {}),
      ...(italic.length > 0 ? { italic } : {}),
    })
    placed = []
    cursor = 0
  }

  for (const word of words) {
    const col = placed.length === 0 ? 0 : cursor + 1
    if (col + word.text.length > width) flushLine()
    const startCol = placed.length === 0 ? 0 : cursor + 1
    placed.push({ ...word, col: startCol })
    cursor = startCol + word.text.length
  }
  flushLine()
  return lines
}

// ---------------------------------------------------------------------------
// Floated images: text wraps into the columns beside a sized left/right image
// ---------------------------------------------------------------------------

/**
 * Greedy word wrap where the line width can change per output line — the float
 * layout needs the text narrow while it runs alongside the image, then full
 * width once it clears the bottom of the image. `widthAt(i)` gives the usable
 * width for output line `i` (offset by `indexOffset`, the number of lines
 * already emitted above this text). Links are tracked relative to each line's
 * own column 0, like `wrapFlatText`.
 */
function wrapFlatTextVariable(
  flat: FlatText,
  widthAt: (lineIndex: number) => number,
  indexOffset: number,
): Line[] {
  const words: Word[] = []
  for (const match of flat.text.matchAll(/\S+/g)) words.push({ text: match[0], src: match.index })

  const lines: Line[] = []
  let placed: Array<Word & { col: number }> = []
  let cursor = 0
  const curWidth = () => Math.max(1, widthAt(indexOffset + lines.length))

  const flushLine = () => {
    if (placed.length === 0) return
    const text = placed.map((w, i) => (i === 0 ? w.text : ' ' + w.text)).join('')
    const bold = lineStyleSpans(placed, flat.bold)
    const italic = lineStyleSpans(placed, flat.italic)
    lines.push({
      text,
      kind: 'body',
      links: lineLinks(placed, flat.links),
      ...(bold.length > 0 ? { bold } : {}),
      ...(italic.length > 0 ? { italic } : {}),
    })
    placed = []
    cursor = 0
  }

  for (const word of words) {
    let w = word
    // Hard-break a word longer than the current line can hold, a chunk at a
    // time — re-reading the width after each flushed line (it may have widened).
    while (w.text.length > curWidth()) {
      if (placed.length > 0) flushLine()
      const width = curWidth()
      placed.push({ text: w.text.slice(0, width), src: w.src, col: 0 })
      cursor = width
      flushLine()
      w = { text: w.text.slice(width), src: w.src + width }
    }
    const width = curWidth()
    if (placed.length > 0 && cursor + 1 + w.text.length > width) flushLine()
    const startCol = placed.length === 0 ? 0 : cursor + 1
    placed.push({ ...w, col: startCol })
    cursor = startCol + w.text.length
  }
  flushLine()
  return lines
}

/** Wrap a run of paragraphs into one variable-width text column, a blank line
 *  between paragraphs (which also advances the line index widthAt sees). */
function wrapParagraphsVariable(paras: FlatText[], widthAt: (i: number) => number): Line[] {
  const out: Line[] = []
  paras.forEach((flat, idx) => {
    if (idx > 0) out.push({ text: '', kind: 'body', links: [] })
    for (const line of wrapFlatTextVariable(flat, widthAt, out.length)) out.push(line)
  })
  return out
}

/** Blanks between a float image and the text beside it. */
const FLOAT_GUTTER = 2
/** Below this many columns of usable text width, floating isn't worth it —
 *  the image renders as a normal block instead. */
const MIN_FLOAT_TEXT_WIDTH = 12

/**
 * Compose a floated image with the paragraphs that wrap around it into a single
 * run of lines. The image sits on `align`'s side for its own height; text fills
 * the opposite columns beside it, then flows full width below it. Image cells
 * keep their colors; text cells stay on the default palette.
 */
function composeFloat(
  render: ImageRender,
  imgCols: number,
  align: 'left' | 'right',
  paras: Block[],
  cols: number,
): Line[] {
  const imgRows = render.lines.length
  const textWidth = cols - imgCols - FLOAT_GUTTER
  const widthAt = (i: number) => (i < imgRows ? textWidth : cols)
  const textLines = wrapParagraphsVariable(
    paras.map((p) => parseInline(p.text)),
    widthAt,
  )

  const imgOffset = align === 'left' ? 0 : cols - imgCols
  const out: Line[] = []
  const total = Math.max(imgRows, textLines.length)
  for (let i = 0; i < total; i++) {
    const cells = new Array<string>(cols).fill(BLANK)
    const colors: (CellColor | null)[] = new Array<CellColor | null>(cols).fill(null)
    const tiles: (ImageTileRef | null)[] = new Array<ImageTileRef | null>(cols).fill(null)
    const links: LinkSpan[] = []
    const bold: Span[] = []
    const italic: Span[] = []

    if (i < imgRows) {
      const imgText = render.lines[i] ?? ''
      for (let c = 0; c < imgText.length; c++) cells[imgOffset + c] = imgText[c] ?? BLANK
      const rowColors = render.colors?.[i]
      if (rowColors) for (let c = 0; c < rowColors.length; c++) colors[imgOffset + c] = rowColors[c] ?? null
      const rowTiles = render.tiles?.[i]
      if (rowTiles) for (let c = 0; c < rowTiles.length; c++) tiles[imgOffset + c] = rowTiles[c] ?? null
    }

    const tl = textLines[i]
    if (tl) {
      // Beside the image, text sits opposite it; below the image it's flush left.
      const textOffset = i < imgRows && align === 'left' ? imgCols + FLOAT_GUTTER : 0
      for (let c = 0; c < tl.text.length; c++) cells[textOffset + c] = tl.text[c] ?? BLANK
      for (const l of tl.links) links.push({ ...l, start: l.start + textOffset, end: l.end + textOffset })
      for (const s of tl.bold ?? []) bold.push({ start: s.start + textOffset, end: s.end + textOffset })
      for (const s of tl.italic ?? []) italic.push({ start: s.start + textOffset, end: s.end + textOffset })
    }

    out.push({
      text: cells.join(''),
      kind: 'body',
      links,
      ...(bold.length > 0 ? { bold } : {}),
      ...(italic.length > 0 ? { italic } : {}),
      // Only image rows carry color/tiles; text-only overflow rows use the default palette.
      colors: i < imgRows ? colors : undefined,
      tiles: i < imgRows ? tiles : undefined,
    })
  }
  return out
}

const LIST_INDENT = 2

/** Shift a span array by `pad` columns; `undefined` in, `undefined` out, so
 *  callers can spread the result straight into a `Line` without an empty key. */
function shiftSpans<S extends Span>(spans: S[] | undefined, pad: number): S[] | undefined {
  return spans?.map((s) => ({ ...s, start: s.start + pad, end: s.end + pad }))
}

/**
 * Pad each already-wrapped line to center/right-align it within `cols`,
 * shifting its link/bold/italic spans by the same amount. Each line is padded
 * to its own length (not the block's longest line), matching the ragged look
 * of the image-align padding above. A no-op for 'left' (or unset), the default.
 */
function applyAlign(lines: Line[], align: ImageAlign | undefined, cols: number): Line[] {
  if (!align || align === 'left') return lines
  return lines.map((line) => {
    const pad =
      align === 'right'
        ? Math.max(0, cols - line.text.length)
        : Math.max(0, Math.floor((cols - line.text.length) / 2))
    if (pad === 0) return line
    return {
      ...line,
      text: ' '.repeat(pad) + line.text,
      links: line.links.map((l) => ({ ...l, start: l.start + pad, end: l.end + pad })),
      bold: shiftSpans(line.bold, pad),
      italic: shiftSpans(line.italic, pad),
    }
  })
}

function renderImageBlock(
  block: Block,
  cols: number,
  rows: number,
  resolve: PaginateOptions['image'] | undefined,
): Line[] {
  const align = block.align ?? 'center'
  const size = imageRequestSize(block, cols, rows)
  let render = resolve?.(block.src ?? '', size.cols, size.rows) ?? null
  if (!render) return [] // not loaded yet — appears on the next re-paginate
  if (block.border) render = withBorder(render)
  return render.lines.map((text, i) => {
    const pad =
      align === 'left'
        ? 0
        : align === 'right'
          ? Math.max(0, cols - text.length)
          : Math.max(0, Math.floor((cols - text.length) / 2))
    const rowColors = render.colors?.[i]
    // Pad the color track with the alignment blanks (null = default palette),
    // keeping it column-aligned with the padded text.
    const colors: (CellColor | null)[] | undefined = rowColors
      ? [...Array<CellColor | null>(pad).fill(null), ...rowColors]
      : undefined
    // Same left-pad for the tile track, so tile-slice images stay aligned too.
    const rowTiles = render.tiles?.[i]
    const tiles: (ImageTileRef | null)[] | undefined = rowTiles
      ? [...Array<ImageTileRef | null>(pad).fill(null), ...rowTiles]
      : undefined
    return { text: ' '.repeat(pad) + text, kind: 'body' as const, links: [], colors, tiles }
  })
}

function renderBlock(
  block: Block,
  cols: number,
  rows: number,
  image?: PaginateOptions['image'],
): Line[] {
  if (block.kind === 'image') {
    return renderImageBlock(block, cols, rows, image)
  }
  const flat = parseInline(block.text)
  if (block.kind === 'heading') {
    return applyAlign(wrapFlatText(flat, cols, 'heading', block.level), block.align, cols)
  }
  if (block.kind === 'listItem') {
    return wrapFlatText(flat, cols - LIST_INDENT, 'body').map((line, i) => ({
      ...line,
      text: (i === 0 ? '- ' : '  ') + line.text,
      links: line.links.map((l) => ({
        ...l,
        start: l.start + LIST_INDENT,
        end: l.end + LIST_INDENT,
      })),
      bold: shiftSpans(line.bold, LIST_INDENT),
      italic: shiftSpans(line.italic, LIST_INDENT),
    }))
  }
  return applyAlign(wrapFlatText(flat, cols, 'body'), block.align, cols)
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

/** A pagination group: its lines, plus — for a `{border=snake}` image — the
 *  ring rectangle relative to the group's first line (its final board row is
 *  resolved when the group lands in a frame). */
interface Group {
  lines: Line[]
  snakeRect?: Omit<BorderRect, 'row'>
}

/** The ring rectangle of a rendered (padded) block image, measured off its top
 *  border row: leading blanks = left column, the box run = width. */
function measureBorderRect(lines: Line[]): Omit<BorderRect, 'row'> {
  const top = lines[0]?.text ?? ''
  const trimmed = top.trimStart()
  return { col: top.length - trimmed.length, width: trimmed.trimEnd().length, height: lines.length }
}

export function paginateMarkdown(markdown: string, options: PaginateOptions): Frame[] {
  const { cols, rows, image } = options
  if (cols < 1 || rows < 1) throw new Error(`invalid frame size ${cols}x${rows}`)

  // Build line groups: each text line is its own (splittable) group; an image
  // is one atomic group that must not break across a frame boundary.
  const blocks = parseBlocks(markdown)
  const groups: Group[] = []
  let previous: Block | undefined
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]!

    // Float: a sized left/right image lets the following paragraph(s) wrap into
    // the columns beside it (then flow full width below it). Needs the image
    // resolved (for its real width) and enough room left over for text.
    if (block.kind === 'image' && block.width && (block.align === 'left' || block.align === 'right')) {
      const size = imageRequestSize(block, cols, rows)
      let render = image?.(block.src ?? '', size.cols, size.rows) ?? null
      if (render && block.border) render = withBorder(render)
      const imgCols = render?.lines[0]?.length ?? 0
      if (render && imgCols > 0 && cols - imgCols - FLOAT_GUTTER >= MIN_FLOAT_TEXT_WIDTH) {
        const paras: Block[] = []
        let j = i + 1
        while (j < blocks.length && blocks[j]!.kind === 'paragraph') paras.push(blocks[j++]!)
        const floatLines = composeFloat(render, imgCols, block.align, paras, cols)
        if (previous) groups.push({ lines: [BLANK_LINE] })
        // Keep the image-height rows together (atomic); overflow text below it
        // paginates line by line like an ordinary paragraph.
        const imgRows = render.lines.length
        const atomic = floatLines.slice(0, imgRows)
        if (atomic.length > 0) {
          const imgOffset = block.align === 'left' ? 0 : cols - imgCols
          groups.push({
            lines: atomic,
            ...(block.snake ? { snakeRect: { col: imgOffset, width: imgCols, height: imgRows } } : {}),
          })
        }
        for (const line of floatLines.slice(imgRows)) groups.push({ lines: [line] })
        previous = paras.length > 0 ? paras[paras.length - 1] : block
        i = j
        continue
      }
      // Not floated (image not ready, or no room) — fall through to block layout.
    }

    const rendered = renderBlock(block, cols, rows, image)
    // An unresolved image renders to nothing; skip its separator too.
    if (rendered.length === 0 && block.kind === 'image') {
      i++
      continue
    }
    // One separator line between blocks, except between consecutive list items.
    if (previous && !(previous.kind === 'listItem' && block.kind === 'listItem')) {
      groups.push({ lines: [BLANK_LINE] })
    }
    if (block.kind === 'image') {
      groups.push({
        lines: rendered,
        ...(block.snake ? { snakeRect: measureBorderRect(rendered) } : {}),
      })
    } else for (const line of rendered) groups.push({ lines: [line] })
    previous = block
    i++
  }

  const frames: Frame[] = []
  let current: Line[] = []
  let currentRings: BorderRect[] = []
  const flushFrame = () => {
    while (current.length < rows) current.push(BLANK_LINE)
    frames.push({ lines: current, ...(currentRings.length > 0 ? { snakeRings: currentRings } : {}) })
    current = []
    currentRings = []
  }
  for (const group of groups) {
    const { lines } = group
    // Never open a frame on a blank separator.
    if (current.length === 0 && lines.length === 1 && lines[0]!.text === '') continue
    // Keep an atomic group (image) whole: page-break before it if it won't fit.
    if (lines.length > 1 && current.length > 0 && current.length + lines.length > rows) {
      flushFrame()
    }
    // A snake ring lands at the group's start row within the frame it opens in
    // (the group is atomic, so it never straddles a frame boundary).
    if (group.snakeRect) currentRings.push({ row: current.length, ...group.snakeRect })
    for (const line of lines) {
      current.push(line)
      if (current.length === rows) {
        frames.push({ lines: current, ...(currentRings.length > 0 ? { snakeRings: currentRings } : {}) })
        current = []
        currentRings = []
      }
    }
  }
  if (current.length > 0 || frames.length === 0) flushFrame()
  return frames
}

/**
 * Render a frame to a grid of displayable cell faces: `rows` arrays of exactly
 * `cols` single characters, padded with blanks and normalized to the
 * character set.
 */
export function frameToGrid(frame: Frame, cols: number): string[][] {
  return frame.lines.map((line) => {
    const cells: string[] = []
    for (let c = 0; c < cols; c++) {
      const char = line.text[c]
      cells.push(char === undefined ? BLANK : normalizeChar(char))
    }
    return cells
  })
}
