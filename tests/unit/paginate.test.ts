import { describe, it, expect } from 'vitest'
import { frameToGrid, paginateMarkdown, parseImageAttrs } from '@/engine/paginate'
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
    const image = (src: string) => (src === '/img.png' ? { lines: ['##', '##'] } : null)
    const [frame] = paginateMarkdown('hi\n\n![alt](/img.png)', { cols: 6, rows: 6, image })
    // Two pixel rows, centered in 6 cols: pad = floor((6-2)/2) = 2.
    expect(texts(frame)[0]).toBe('hi')
    expect(texts(frame)[2]).toBe('  ##')
    expect(texts(frame)[3]).toBe('  ##')
  })

  it('left-aligns an image with {align=left}', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##'] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){align=left}', { cols: 6, rows: 2, image })
    expect(texts(frame)[0]).toBe('##')
  })

  it('right-aligns an image with {align=right}', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##'] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){align=right}', { cols: 6, rows: 2, image })
    expect(texts(frame)[0]).toBe('    ##')
  })

  it('requests a narrower render and passes maxCols to the resolver', () => {
    let requestedMaxCols: number | undefined
    const image = (src: string, maxCols?: number) => {
      requestedMaxCols = maxCols
      return src === '/img.png' ? { lines: ['#'] } : null
    }
    paginateMarkdown('![alt](/img.png){width=3}', { cols: 10, rows: 2, image })
    expect(requestedMaxCols).toBe(3)
  })

  it('caps a requested width at the available columns', () => {
    let requestedMaxCols: number | undefined
    const image = (src: string, maxCols?: number) => {
      requestedMaxCols = maxCols
      return src === '/img.png' ? { lines: ['#'] } : null
    }
    paginateMarkdown('![alt](/img.png){width=999}', { cols: 10, rows: 2, image })
    expect(requestedMaxCols).toBe(10)
  })

  it('combines width and align attributes', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##'] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){width=4 align=right}', {
      cols: 10,
      rows: 2,
      image,
    })
    expect(texts(frame)[0]).toBe('        ##')
  })

  it('pads the color track to match alignment', () => {
    const image = (src: string) =>
      src === '/img.png' ? { lines: ['#'], colors: [[{ fg: 'red', bg: 'blue' }]] } : null
    const [frame] = paginateMarkdown('![alt](/img.png){align=right}', { cols: 4, rows: 2, image })
    const line = frame.lines[0]!
    expect(line.text).toBe('   #')
    expect(line.colors?.[3]).toEqual({ fg: 'red', bg: 'blue' })
    expect(line.colors?.[0]).toBeNull()
  })
})

describe('paginateMarkdown — floated images (text wraps around)', () => {
  const img3 = (lines = ['###', '###', '###']) => (src: string) =>
    src === '/i.png' ? { lines } : null
  const LONG = 'alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu'

  it('wraps a following paragraph beside a left-floated image', () => {
    const [frame] = paginateMarkdown(`![a](/i.png){width=3 align=left}\n\n${LONG}`, {
      cols: 20,
      rows: 12,
      image: img3(),
    })
    const t = texts(frame)
    // Image occupies the first 3 columns of its 3 rows...
    expect(t[0].slice(0, 3)).toBe('###')
    expect(t[1].slice(0, 3)).toBe('###')
    expect(t[2].slice(0, 3)).toBe('###')
    // ...a 2-col gutter, then text begins at column 5 beside it.
    expect(t[0].slice(3, 5)).toBe('  ')
    expect(t[0][5]).toMatch(/\S/)
    // Below the image the text runs full width, flush at column 0.
    expect(t[3][0]).toMatch(/\S/)
  })

  it('places a right-floated image on the right with text flush left', () => {
    const [frame] = paginateMarkdown(`![a](/i.png){width=3 align=right}\n\n${LONG}`, {
      cols: 20,
      rows: 12,
      image: img3(),
    })
    const t = texts(frame)
    expect(t[0].slice(17)).toBe('###') // image at the right edge (cols 17-19)
    expect(t[0][0]).toMatch(/\S/) // text flush left
  })

  it('shifts link columns to sit beside a left float', () => {
    const [frame] = paginateMarkdown(
      `![a](/i.png){width=3 align=left}\n\n[home](/) and more text here to fill the line`,
      { cols: 24, rows: 12, image: img3() },
    )
    const link = frame.lines[0]!.links[0]!
    expect(link.start).toBeGreaterThanOrEqual(5) // past image (3) + gutter (2)
    expect(frame.lines[0]!.text.slice(link.start, link.end)).toBe('home')
  })

  it('carries image colors on the float rows only', () => {
    const image = (src: string) =>
      src === '/i.png'
        ? {
            lines: ['##', '##'],
            colors: [
              [
                { fg: 'red', bg: 'black' },
                { fg: 'red', bg: 'black' },
              ],
              [
                { fg: 'red', bg: 'black' },
                { fg: 'red', bg: 'black' },
              ],
            ],
          }
        : null
    const [frame] = paginateMarkdown(`![a](/i.png){width=2 align=left}\n\n${LONG}`, {
      cols: 20,
      rows: 12,
      image,
    })
    expect(frame.lines[0]!.colors?.[0]).toEqual({ fg: 'red', bg: 'black' })
    // Rows below the image (index >= 2) carry no color.
    expect(frame.lines[2]!.colors).toBeUndefined()
  })

  it('falls back to a block image when there is no room to wrap', () => {
    // 6 cols, a 5-col image → only -1 cols left for text: no float.
    const [frame] = paginateMarkdown('![a](/i.png){width=5 align=left}\n\nhello world', {
      cols: 6,
      rows: 6,
      image: img3(['#####']),
    })
    const t = texts(frame)
    expect(t[0]).toBe('#####') // block image (left-aligned), full line to itself
    // The paragraph is NOT consumed into a float — it appears on its own line.
    expect(t.some((line) => line.startsWith('hello'))).toBe(true)
  })

  it('does not float a centered image', () => {
    const [frame] = paginateMarkdown('![a](/i.png){width=3 align=center}\n\ntext here', {
      cols: 20,
      rows: 12,
      image: img3(),
    })
    // Centered image keeps its own rows; text is a separate block below it.
    const t = texts(frame)
    expect(t[0].trim()).toBe('###')
    expect(t.some((line) => line.trim() === 'text here')).toBe(true)
  })
})

describe('parseImageAttrs', () => {
  it('defaults to center with no width when given nothing', () => {
    expect(parseImageAttrs(undefined)).toEqual({ align: 'center' })
  })

  it('parses width and align together', () => {
    expect(parseImageAttrs('width=12 align=left')).toEqual({ width: 12, align: 'left' })
  })

  it('ignores malformed or unknown keys', () => {
    expect(parseImageAttrs('width=abc align=sideways foo=bar')).toEqual({ align: 'center' })
  })

  it('ignores a non-positive width', () => {
    expect(parseImageAttrs('width=0')).toEqual({ align: 'center' })
    expect(parseImageAttrs('width=-5')).toEqual({ align: 'center' })
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
