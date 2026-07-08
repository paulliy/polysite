/**
 * Markdown → word-wrapped lines → paginated frames (brief §2, CLAUDE.md #10).
 *
 * Book-style pagination: lines flow continuously and are sliced into frames of
 * `rows` lines — paragraphs split across frame boundaries freely. The only
 * page-level nicety is that a frame never *starts* with a blank separator line.
 *
 * Supported markdown subset for v1: #–###### headings, paragraphs, `-`/`*`
 * list items, [text](href) links. Emphasis markers (**, *, `) are stripped —
 * a flap board renders characters, not inline styles. Images (![alt](src))
 * are parsed out and ignored until the image pipeline lands in Phase 8.
 */

import type { Frame, InlineSegment, Line, LinkSpan, SemanticBlock } from './types'
import { BLANK, expandIconShortcodes, isIcon, normalizeChar, normalizeText } from './characterSet'
import { ICON_LABELS } from './icons'

export interface PaginateOptions {
  /** Content-region width in character cells. */
  cols: number
  /** Content-region height in lines (grid rows minus nav rows). */
  rows: number
  /**
   * Resolves an image `src` to its pre-rendered pixelated character lines, or
   * null if it isn't ready. Injected so the engine stays pure — the browser
   * canvas pipeline lives in content/imageLoader.ts.
   */
  image?: (src: string) => string[] | null
}

const BLANK_LINE: Line = { text: '', kind: 'body', links: [] }

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
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_ITEM_RE = /^[-*]\s+(.*)$/
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  // The list item still accepting continuation lines, if any.
  let openListItem: Block | null = null

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') })
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
      blocks.push({ kind: 'image', text: image[1] ?? '', src: image[2] ?? '' })
      continue
    }
    const heading = HEADING_RE.exec(line)
    if (heading) {
      flush()
      openListItem = null
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, text: heading[2] ?? '' })
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
// Inline parsing: links out, emphasis markers stripped
// ---------------------------------------------------------------------------

interface FlatText {
  text: string
  links: LinkSpan[] // offsets into `text`
}

const LINK_RE = /\[([^\]]*)\]\(([^)\s]+)\)/g

function stripEmphasis(text: string): string {
  return text.replace(/\*\*|\*|`/g, '')
}

/** Collapse runs of whitespace and resolve links/emphasis to plain text. */
function parseInline(raw: string): FlatText {
  const source = expandIconShortcodes(normalizeText(raw)).replace(/\s+/g, ' ').trim()
  let text = ''
  const links: LinkSpan[] = []
  let lastIndex = 0

  for (const match of source.matchAll(LINK_RE)) {
    text += stripEmphasis(source.slice(lastIndex, match.index))
    const label = stripEmphasis(match[1] ?? '')
    const href = match[2] ?? ''
    if (label.length > 0) {
      links.push({ start: text.length, end: text.length + label.length, href })
      text += label
    }
    lastIndex = match.index + match[0].length
  }
  text += stripEmphasis(source.slice(lastIndex))
  return { text, links }
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

/** Split flat text + link spans into an ordered run of plain/link segments,
 *  with decorative icon faces resolved for assistive tech. */
function toSegments(flat: FlatText): InlineSegment[] {
  const segments: InlineSegment[] = []
  let cursor = 0
  const pushText = (raw: string) => {
    // Collapse whitespace left by removed icons, but keep inter-segment spacing.
    const text = stripIcons(raw).replace(/\s+/g, ' ')
    if (text.trim()) segments.push({ text })
  }
  for (const link of flat.links) {
    if (link.start > cursor) pushText(flat.text.slice(cursor, link.start))
    const raw = flat.text.slice(link.start, link.end)
    const cleaned = stripIcons(raw).replace(/\s+/g, ' ').trim()
    segments.push({ text: cleaned || iconLabelsOf(raw), href: link.href })
    cursor = link.end
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

function lineLinks(placed: Array<Word & { col: number }>, links: LinkSpan[]): LinkSpan[] {
  const spans: LinkSpan[] = []
  for (const word of placed) {
    const wordEnd = word.src + word.text.length
    for (const link of links) {
      const start = Math.max(link.start, word.src)
      const end = Math.min(link.end, wordEnd)
      if (start < end) {
        spans.push({
          start: word.col + (start - word.src),
          end: word.col + (end - word.src),
          href: link.href,
        })
      }
    }
  }
  // Merge spans of the same link separated only by the space between words.
  const merged: LinkSpan[] = []
  for (const span of spans) {
    const prev = merged[merged.length - 1]
    if (prev && prev.href === span.href && span.start - prev.end <= 1) {
      prev.end = span.end
    } else {
      merged.push({ ...span })
    }
  }
  return merged
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
    lines.push({ text, kind, level, links: lineLinks(placed, flat.links) })
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

const LIST_INDENT = 2

function renderImageBlock(src: string, cols: number, resolve?: PaginateOptions['image']): Line[] {
  const charLines = resolve?.(src) ?? null
  if (!charLines) return [] // not loaded yet — appears on the next re-paginate
  return charLines.map((text) => {
    const pad = Math.max(0, Math.floor((cols - text.length) / 2))
    return { text: ' '.repeat(pad) + text, kind: 'body' as const, links: [] }
  })
}

function renderBlock(block: Block, cols: number, image?: PaginateOptions['image']): Line[] {
  if (block.kind === 'image') {
    return renderImageBlock(block.src ?? '', cols, image)
  }
  const flat = parseInline(block.text)
  if (block.kind === 'heading') {
    return wrapFlatText(flat, cols, 'heading', block.level)
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
    }))
  }
  return wrapFlatText(flat, cols, 'body')
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export function paginateMarkdown(markdown: string, options: PaginateOptions): Frame[] {
  const { cols, rows, image } = options
  if (cols < 1 || rows < 1) throw new Error(`invalid frame size ${cols}x${rows}`)

  // Build line groups: each text line is its own (splittable) group; an image
  // is one atomic group that must not break across a frame boundary.
  const blocks = parseBlocks(markdown)
  const groups: Line[][] = []
  let previous: Block | undefined
  for (const block of blocks) {
    const rendered = renderBlock(block, cols, image)
    // An unresolved image renders to nothing; skip its separator too.
    if (rendered.length === 0 && block.kind === 'image') continue
    // One separator line between blocks, except between consecutive list items.
    if (previous && !(previous.kind === 'listItem' && block.kind === 'listItem')) {
      groups.push([BLANK_LINE])
    }
    if (block.kind === 'image') groups.push(rendered)
    else for (const line of rendered) groups.push([line])
    previous = block
  }

  const frames: Frame[] = []
  let current: Line[] = []
  const flushFrame = () => {
    while (current.length < rows) current.push(BLANK_LINE)
    frames.push({ lines: current })
    current = []
  }
  for (const group of groups) {
    // Never open a frame on a blank separator.
    if (current.length === 0 && group.length === 1 && group[0]!.text === '') continue
    // Keep an atomic group (image) whole: page-break before it if it won't fit.
    if (group.length > 1 && current.length > 0 && current.length + group.length > rows) {
      flushFrame()
    }
    for (const line of group) {
      current.push(line)
      if (current.length === rows) {
        frames.push({ lines: current })
        current = []
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
