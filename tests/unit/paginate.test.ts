import { describe, it, expect } from 'vitest'
import { frameToGrid, paginateMarkdown } from '@/engine/paginate'
import { FALLBACK_FACE } from '@/engine/characterSet'
import type { Frame } from '@/engine/types'

const OPTS = { cols: 20, rows: 5 }

function texts(frame: Frame): string[] {
  return frame.lines.map((l) => l.text)
}

describe('paginateMarkdown — wrapping', () => {
  it('wraps words to the column width without breaking them', () => {
    const [frame] = paginateMarkdown('alpha beta gamma delta epsilon', OPTS)
    expect(texts(frame)).toEqual(['alpha beta gamma', 'delta epsilon', '', '', ''])
    for (const line of frame.lines) {
      expect(line.text.length).toBeLessThanOrEqual(OPTS.cols)
    }
  })

  it('hard-breaks words longer than the line width', () => {
    const [frame] = paginateMarkdown('abcdefghijklmnopqrstuvwxyz', OPTS)
    expect(texts(frame)[0]).toBe('abcdefghijklmnopqrst')
    expect(texts(frame)[1]).toBe('uvwxyz')
  })

  it('collapses internal whitespace and newlines within a paragraph', () => {
    const [frame] = paginateMarkdown('one  two\nthree', OPTS)
    expect(texts(frame)[0]).toBe('one two three')
  })

  it('marks heading lines with kind and level', () => {
    const [frame] = paginateMarkdown('## Projects\n\nBody text.', OPTS)
    expect(frame.lines[0]).toMatchObject({ text: 'Projects', kind: 'heading', level: 2 })
    expect(frame.lines[1].text).toBe('')
    expect(frame.lines[2]).toMatchObject({ text: 'Body text.', kind: 'body' })
  })

  it('renders list items with a hanging indent and no separator between items', () => {
    const [frame] = paginateMarkdown('- first item here that wraps around\n- second', {
      cols: 16,
      rows: 5,
    })
    expect(texts(frame)).toEqual([
      '- first item',
      '  here that',
      '  wraps around',
      '- second',
      '',
    ])
  })

  it('merges list-item continuation lines into the item', () => {
    const md = '- first item that\n  continues on a second source line\n- second item'
    const [frame] = paginateMarkdown(md, { cols: 24, rows: 6 })
    expect(texts(frame)).toEqual([
      '- first item that',
      '  continues on a second',
      '  source line',
      '- second item',
      '',
      '',
    ])
  })

  it('strips emphasis markers but keeps their content', () => {
    const [frame] = paginateMarkdown('this is **bold** and *em* and `code`', OPTS)
    expect(texts(frame)[0]).toBe('this is bold and em')
    expect(texts(frame)[1]).toBe('and code')
  })
})

describe('paginateMarkdown — links', () => {
  it('replaces link syntax with the label and records its span', () => {
    const [frame] = paginateMarkdown('mail [me](mailto:x@y.z) now', OPTS)
    expect(texts(frame)[0]).toBe('mail me now')
    expect(frame.lines[0].links).toEqual([{ start: 5, end: 7, href: 'mailto:x@y.z' }])
  })

  it('keeps a multi-word link contiguous across the space between words', () => {
    const [frame] = paginateMarkdown('see [the projects](/projects) page', OPTS)
    expect(texts(frame)[0]).toBe('see the projects')
    expect(frame.lines[0].links).toEqual([{ start: 4, end: 16, href: '/projects' }])
  })

  it('splits a link that wraps across lines into per-line spans', () => {
    const md = 'aaaa bbbb [linked words here](/x)'
    const [frame] = paginateMarkdown(md, { cols: 16, rows: 5 })
    expect(texts(frame)).toEqual(['aaaa bbbb linked', 'words here', '', '', ''])
    expect(frame.lines[0].links).toEqual([{ start: 10, end: 16, href: '/x' }])
    expect(frame.lines[1].links).toEqual([{ start: 0, end: 10, href: '/x' }])
  })
})

describe('paginateMarkdown — pagination', () => {
  it('splits paragraphs across frame boundaries book-style', () => {
    const words = Array.from({ length: 40 }, (_, i) => `w${String(i).padStart(2, '0')}`)
    const frames = paginateMarkdown(words.join(' '), { cols: 9, rows: 3 })
    // 9 cols fit two 3-char words per line -> 20 lines -> 7 frames
    expect(frames.length).toBeGreaterThan(1)
    // continuation: first line of frame 2 picks up mid-paragraph
    expect(frames[1].lines[0].text).toBe('w06 w07')
  })

  it('never starts a frame with a blank separator line', () => {
    const frames = paginateMarkdown('one\n\ntwo\n\nthree\n\nfour', { cols: 20, rows: 2 })
    for (const frame of frames) {
      expect(frame.lines[0].text).not.toBe('')
    }
  })

  it('pads the last frame to exactly rows lines', () => {
    const frames = paginateMarkdown('short', OPTS)
    expect(frames).toHaveLength(1)
    expect(frames[0].lines).toHaveLength(OPTS.rows)
  })

  it('returns a single all-blank frame for empty markdown', () => {
    const frames = paginateMarkdown('', OPTS)
    expect(frames).toHaveLength(1)
    expect(texts(frames[0])).toEqual(['', '', '', '', ''])
  })

  it('renders nothing for an image with no resolver, keeping surrounding text', () => {
    const [frame] = paginateMarkdown('before\n\n![alt](/img.png)\n\nafter', OPTS)
    expect(texts(frame).join('|')).not.toContain('img.png')
    expect(texts(frame)[0]).toBe('before')
    expect(texts(frame)[2]).toBe('after')
  })

  it('inserts a resolved image as centered pixel rows', () => {
    const image = (src: string) => (src === '/img.png' ? ['##', '##'] : null)
    const [frame] = paginateMarkdown('hi\n\n![alt](/img.png)', { cols: 6, rows: 6, image })
    // Two pixel rows, centered in 6 cols: pad = floor((6-2)/2) = 2.
    expect(texts(frame)[0]).toBe('hi')
    expect(texts(frame)[2]).toBe('  ##')
    expect(texts(frame)[3]).toBe('  ##')
  })
})

describe('frameToGrid', () => {
  it('pads and truncates lines to exactly cols cells', () => {
    const [frame] = paginateMarkdown('hi', { cols: 4, rows: 2 })
    const grid = frameToGrid(frame, 4)
    expect(grid).toEqual([
      ['h', 'i', ' ', ' '],
      [' ', ' ', ' ', ' '],
    ])
  })

  it('normalizes characters to displayable faces', () => {
    const [frame] = paginateMarkdown('café →', OPTS)
    const grid = frameToGrid(frame, OPTS.cols)
    expect(grid[0].slice(0, 6).join('')).toBe(`cafe ${FALLBACK_FACE}`)
  })
})
