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

import type { Frame, Line, LinkSpan } from './types'
import { BLANK, normalizeChar, normalizeText } from './characterSet'

export interface PaginateOptions {
  /** Content-region width in character cells. */
  cols: number
  /** Content-region height in lines (grid rows minus nav rows). */
  rows: number
}

const BLANK_LINE: Line = { text: '', kind: 'body', links: [] }

// ---------------------------------------------------------------------------
// Block parsing
// ---------------------------------------------------------------------------

interface Block {
  kind: 'heading' | 'paragraph' | 'listItem'
  text: string
  level?: number
}

const HEADING_RE = /^(#{1,6})\s+(.*)$/
const LIST_ITEM_RE = /^[-*]\s+(.*)$/
const IMAGE_RE = /^!\[[^\]]*\]\([^)]*\)$/

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
    if (IMAGE_RE.test(line)) {
      // Image blocks are ignored until Phase 8's grid-pixelation pipeline.
      flush()
      openListItem = null
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
  const source = normalizeText(raw).replace(/\s+/g, ' ').trim()
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

function renderBlock(block: Block, cols: number): Line[] {
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
  const { cols, rows } = options
  if (cols < 1 || rows < 1) throw new Error(`invalid frame size ${cols}x${rows}`)

  const blocks = parseBlocks(markdown)
  const lines: Line[] = []
  let previous: Block | undefined
  for (const block of blocks) {
    // One separator line between blocks, except between consecutive list items.
    if (previous && !(previous.kind === 'listItem' && block.kind === 'listItem')) {
      lines.push(BLANK_LINE)
    }
    lines.push(...renderBlock(block, cols))
    previous = block
  }

  const frames: Frame[] = []
  let current: Line[] = []
  for (const line of lines) {
    if (current.length === 0 && line.text === '') continue // no separator at frame top
    current.push(line)
    if (current.length === rows) {
      frames.push({ lines: current })
      current = []
    }
  }
  if (current.length > 0 || frames.length === 0) {
    while (current.length < rows) current.push(BLANK_LINE)
    frames.push({ lines: current })
  }
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
