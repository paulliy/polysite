import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useBoardStore } from '@/stores/board'
import { paginateMarkdown } from '@/engine/paginate'
import {
  FOOTER_ROWS,
  GRID_COLS,
  GRID_ROWS,
  NAV_ROWS,
  RIPPLE_ROW_STAGGER_MS,
  FLIP_INTERMEDIATE_TOP_MAX,
  FLIP_INTERMEDIATE_BOTTOM_MIN,
} from '@/config'
import { BLANK } from '@/engine/characterSet'

const CONTENT_ROWS = GRID_ROWS - NAV_ROWS - FOOTER_ROWS

describe('board store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with a fully blank content region of the configured size', () => {
    const board = useBoardStore()
    expect(board.contentRows).toHaveLength(CONTENT_ROWS)
    for (const row of board.contentRows) {
      expect(row).toHaveLength(GRID_COLS)
      expect(row.every((cell) => cell.face === BLANK && cell.href === null)).toBe(true)
    }
  })

  it('renders a frame into faces, hrefs, and heading flags', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('# Title\n\nsee [projects](/projects) now', {
      cols: GRID_COLS,
      rows: CONTENT_ROWS,
    })
    board.setPage([frame!])

    const titleRow = board.contentRows[0]!
    expect(titleRow.slice(0, 5).map((c) => c.face).join('')).toBe('Title')
    expect(titleRow[0]!.heading).toBe(true)

    const bodyRow = board.contentRows[2]!
    expect(bodyRow.map((c) => c.face).join('').trimEnd()).toBe('see projects now')
    const linkCells = bodyRow.filter((c) => c.href === '/projects')
    expect(linkCells.map((c) => c.face).join('')).toBe('projects')
    expect(bodyRow[0]!.href).toBeNull()
  })

  it('always fills the full content region even for short frames', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('hi', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])
    expect(board.contentRows).toHaveLength(CONTENT_ROWS)
    expect(board.contentRows.at(-1)!.every((c) => c.face === BLANK)).toBe(true)
  })

  it('pages through frames with clamped advance', () => {
    const board = useBoardStore()
    const words = Array.from({ length: 600 }, (_, i) => `word${i}`).join(' ')
    const frames = paginateMarkdown(words, { cols: GRID_COLS, rows: CONTENT_ROWS })
    expect(frames.length).toBeGreaterThan(1)

    board.setPage(frames)
    expect(board.position).toBe(0)
    const firstRowAtStart = board.contentRows[0]!.map((c) => c.face).join('')

    board.advance(1)
    expect(board.position).toBe(1)
    expect(board.contentRows[0]!.map((c) => c.face).join('')).not.toBe(firstRowAtStart)

    board.advance(-5)
    expect(board.position).toBe(0)

    board.advance(999)
    expect(board.position).toBe(frames.length - 1)
  })

  it('resets position when a new page is set', () => {
    const board = useBoardStore()
    const long = paginateMarkdown('x '.repeat(2000), { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage(long)
    board.advance(2)
    expect(board.position).toBeGreaterThan(0)

    const [short] = paginateMarkdown('fresh page', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([short!])
    expect(board.position).toBe(0)
    expect(board.contentRows[0]!.map((c) => c.face).join('').trimEnd()).toBe('fresh page')
  })

  it('keeps the footer blank on single-frame pages', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('short', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])
    for (const row of board.footerRows) {
      expect(row.every((c) => c.face === BLANK)).toBe(true)
    }
  })

  it('stacks the arrows corner-right: v over ^, only when available', () => {
    const board = useBoardStore()
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ')
    const frames = paginateMarkdown(words, { cols: GRID_COLS, rows: CONTENT_ROWS })
    expect(frames.length).toBeGreaterThan(2)
    board.setPage(frames)

    const corner = (row: number) => board.footerRows[row]!.at(-1)!.face
    const restBlank = (row: number) =>
      board.footerRows[row]!.slice(0, -1).every((c) => c.face === BLANK)

    // First frame: only "more below".
    expect(corner(0)).toBe('v')
    expect(corner(1)).toBe(BLANK)

    // Middle frame: both arrows — the diamond.
    board.advance(1)
    expect(corner(0)).toBe('v')
    expect(corner(1)).toBe('^')
    expect(restBlank(0) && restBlank(1)).toBe(true)

    // Last frame: only "more above".
    board.advance(999)
    expect(corner(0)).toBe(BLANK)
    expect(corner(1)).toBe('^')
  })

  it('caps nav at the configured row count', () => {
    const board = useBoardStore()
    const line = { text: 'x'.repeat(GRID_COLS), kind: 'body' as const, links: [] }
    board.setNav([line, line, line, line])
    expect(board.navRows).toHaveLength(NAV_ROWS)
    expect(board.rowCount).toBe(GRID_ROWS)
  })

  it('records flips only for cells whose face changes', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('ab', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])

    // Blank board → "ab" plus nothing else: exactly two flips, in content row 0.
    expect(board.flips.size).toBe(2)
    const first = board.flips.get(`${NAV_ROWS}:0`)!
    expect(first.from.face).toBe(BLANK)
    expect(first.delayMs).toBe(NAV_ROWS * RIPPLE_ROW_STAGGER_MS)
    expect(board.flips.has(`${NAV_ROWS}:2`)).toBe(false) // blank→blank never flips
  })

  it('flips cells whose paint changes even when the character does not', () => {
    const board = useBoardStore()
    const [linked] = paginateMarkdown('[b c](/x)', { cols: GRID_COLS, rows: CONTENT_ROWS })
    const [plain] = paginateMarkdown('b c', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([linked!])
    board.setPage([plain!])

    // Same characters ("b c") — but all three cells lose the navy link
    // paint, including the blank between the words, so all three flip.
    expect(board.flips.size).toBe(3)
    expect(board.flips.has(`${NAV_ROWS}:1`)).toBe(true)
  })

  it('draws fewer intermediate flaps near the top than near the bottom', () => {
    const board = useBoardStore()
    // A full page of words so every content row flips from blank.
    board.setPage(paginateMarkdown('word '.repeat(3000), { cols: GRID_COLS, rows: CONTENT_ROWS }))

    const lengthsByRow = new Map<number, number[]>()
    for (const [key, flip] of board.flips) {
      const row = Number(key.split(':')[0])
      ;(lengthsByRow.get(row) ?? lengthsByRow.set(row, []).get(row)!).push(flip.faces.length)
    }

    const topRow = NAV_ROWS // first content row
    const bottomRow = NAV_ROWS + CONTENT_ROWS - 1 // last content row
    const longestTop = Math.max(...(lengthsByRow.get(topRow) ?? []))
    const shortestBottom = Math.min(...(lengthsByRow.get(bottomRow) ?? []))

    // faces = [from, ...intermediates, to], so length = intermediates + 2.
    expect(longestTop).toBeLessThanOrEqual(FLIP_INTERMEDIATE_TOP_MAX + 2)
    expect(shortestBottom).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_BOTTOM_MIN + 2)
    expect(shortestBottom).toBeGreaterThan(longestTop)
  })

  it('does not flip anything when the target equals the current board', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('same text', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])
    board.setPage([frame!])
    expect(board.flips.size).toBe(0)
  })

  it('gives every flip a face sequence from old face to target that the cell renders', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('Hi 42', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])
    expect(board.flips.size).toBeGreaterThan(0)
    for (const flip of board.flips.values()) {
      // At minimum old → target; BoardCell steps through faces hop by hop, so
      // an empty/short sequence would skip the intermediates (the bug we hit).
      expect(flip.faces.length).toBeGreaterThanOrEqual(2)
      expect(flip.faces[0]).toBe(flip.from.face)
      expect(flip.faces.at(-1)).not.toBe(BLANK) // every target here is a glyph
      for (const face of flip.faces.slice(1, -1)) expect(face).not.toBe(BLANK)
    }
  })

  it('staggers flip delays by global row for the top-to-bottom ripple', () => {
    const board = useBoardStore()
    const frames = paginateMarkdown('one\n\ntwo\n\nthree', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage(frames)
    for (const [key, flip] of board.flips) {
      const row = Number(key.split(':')[0])
      expect(flip.delayMs).toBe(row * RIPPLE_ROW_STAGGER_MS)
    }
  })

  it('clears a flip once the cell reports the animation finished', () => {
    const board = useBoardStore()
    const [frame] = paginateMarkdown('x', { cols: GRID_COLS, rows: CONTENT_ROWS })
    board.setPage([frame!])
    expect(board.flips.has(`${NAV_ROWS}:0`)).toBe(true)
    board.completeFlip(NAV_ROWS, 0)
    expect(board.flips.has(`${NAV_ROWS}:0`)).toBe(false)
  })

  it('flips the footer arrows along with a scroll step', () => {
    const board = useBoardStore()
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`).join(' ')
    board.setPage(paginateMarkdown(words, { cols: GRID_COLS, rows: CONTENT_ROWS }))
    board.advance(1)
    // The "^" appears in the bottom footer row → that cell must be flipping.
    const upArrowRow = NAV_ROWS + CONTENT_ROWS + 1
    expect(board.flips.has(`${upArrowRow}:${GRID_COLS - 1}`)).toBe(true)
  })
})
