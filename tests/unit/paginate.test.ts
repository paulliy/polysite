import { describe, it, expect } from 'vitest'
import { frameToGrid, paginateMarkdown, parseImageAttrs } from '@/engine/paginate'
import { FALLBACK_FACE } from '@/engine/characterSet'
import type { Frame, ImageTileRef } from '@/engine/types'

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

  it('strips emphasis markers from the text, keeping their content', () => {
    const [frame] = paginateMarkdown('this is **bold** and *em* and `code`', OPTS)
    expect(texts(frame)[0]).toBe('this is bold and em')
    expect(texts(frame)[1]).toBe('and code')
  })
})

describe('paginateMarkdown — bold/italic', () => {
  it('tracks a bold span at the right columns', () => {
    const [frame] = paginateMarkdown('this is **bold** text', OPTS)
    expect(frame.lines[0].text).toBe('this is bold text')
    expect(frame.lines[0].bold).toEqual([{ start: 8, end: 12 }])
    expect(frame.lines[0].italic).toBeUndefined()
  })

  it('tracks an italic span at the right columns', () => {
    const [frame] = paginateMarkdown('this is *italic* text', OPTS)
    expect(frame.lines[0].text).toBe('this is italic text')
    expect(frame.lines[0].italic).toEqual([{ start: 8, end: 14 }])
    expect(frame.lines[0].bold).toBeUndefined()
  })

  it('tracks bold and italic spans in the same line', () => {
    const [frame] = paginateMarkdown('**bold** then *italic*', OPTS)
    expect(frame.lines[0].text).toBe('bold then italic')
    expect(frame.lines[0].bold).toEqual([{ start: 0, end: 4 }])
    expect(frame.lines[0].italic).toEqual([{ start: 10, end: 16 }])
  })

  it('splits a bold span that wraps across lines into per-line spans', () => {
    const [frame] = paginateMarkdown('aaaa bbbb **bolded words here**', { cols: 16, rows: 5 })
    expect(texts(frame)).toEqual(['aaaa bbbb bolded', 'words here', '', '', ''])
    expect(frame.lines[0].bold).toEqual([{ start: 10, end: 16 }])
    expect(frame.lines[1].bold).toEqual([{ start: 0, end: 10 }])
  })

  it('shifts a bold span for a centered paragraph', () => {
    const [frame] = paginateMarkdown('**hi** {align=center}', { cols: 20, rows: 3 })
    // len 2, pad = floor((20-2)/2) = 9
    expect(frame.lines[0].text).toBe(' '.repeat(9) + 'hi')
    expect(frame.lines[0].bold).toEqual([{ start: 9, end: 11 }])
  })

  it('shifts a bold span inside a list item by the hanging indent', () => {
    const [frame] = paginateMarkdown('- **first** item', { cols: 20, rows: 3 })
    expect(frame.lines[0].text).toBe('- first item')
    expect(frame.lines[0].bold).toEqual([{ start: 2, end: 7 }])
  })

  it('does not recognize underscore emphasis', () => {
    const [frame] = paginateMarkdown('a _snake_case_ name', OPTS)
    expect(frame.lines[0].text).toBe('a _snake_case_ name')
    expect(frame.lines[0].bold).toBeUndefined()
    expect(frame.lines[0].italic).toBeUndefined()
  })

  it('lets the outermost marker win when bold and a link overlap', () => {
    // Bold's greedy match runs to the last "**", swallowing the link syntax
    // as literal (unsupported) text rather than recognizing a nested link.
    const [frame] = paginateMarkdown('**[text](href)**', OPTS)
    expect(frame.lines[0].text).toBe('[text](href)')
    expect(frame.lines[0].bold).toEqual([{ start: 0, end: 12 }])
    expect(frame.lines[0].links).toEqual([])
  })
})

describe('paginateMarkdown — text alignment', () => {
  it('left-aligns by default', () => {
    const [frame] = paginateMarkdown('hello world', { cols: 20, rows: 3 })
    expect(frame.lines[0].text).toBe('hello world')
  })

  it('centers a paragraph with a trailing {align=center} attribute', () => {
    const [frame] = paginateMarkdown('hi there {align=center}', { cols: 20, rows: 3 })
    // len 8, pad = floor((20-8)/2) = 6
    expect(frame.lines[0].text).toBe(' '.repeat(6) + 'hi there')
  })

  it('right-aligns a paragraph with a trailing {align=right} attribute', () => {
    const [frame] = paginateMarkdown('hi there {align=right}', { cols: 20, rows: 3 })
    expect(frame.lines[0].text).toBe(' '.repeat(12) + 'hi there')
  })

  it('centers a heading with a trailing {align=center} attribute', () => {
    const [frame] = paginateMarkdown('## Title {align=center}', { cols: 20, rows: 3 })
    // len 5, pad = floor((20-5)/2) = 7
    expect(frame.lines[0]).toMatchObject({ text: `${' '.repeat(7)}Title`, kind: 'heading', level: 2 })
  })

  it('aligns every wrapped line of a multi-line paragraph independently', () => {
    const [frame] = paginateMarkdown('alpha beta gamma delta epsilon {align=center}', {
      cols: 17,
      rows: 3,
    })
    // Wraps to 'alpha beta gamma' (16, pad 0) and 'delta epsilon' (13, pad 2) at cols=17.
    expect(frame.lines[0].text).toBe('alpha beta gamma')
    expect(frame.lines[1].text).toBe('  delta epsilon')
  })

  it('shifts link columns when centering', () => {
    const [frame] = paginateMarkdown('see [me](/me) {align=center}', { cols: 20, rows: 3 })
    const pad = Math.floor((20 - 'see me'.length) / 2)
    expect(frame.lines[0].text).toBe(' '.repeat(pad) + 'see me')
    expect(frame.lines[0].links).toEqual([{ start: pad + 4, end: pad + 6, href: '/me' }])
  })

  it('does not treat braces in the middle of a line as an attribute', () => {
    const [frame] = paginateMarkdown('a {align=center} paragraph', { cols: 40, rows: 3 })
    expect(frame.lines[0].text).toBe('a {align=center} paragraph')
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

  it('pads the tile track to match alignment', () => {
    const t: ImageTileRef = { src: '/img.png', col: 0, row: 0, cols: 1, rows: 1 }
    const image = (src: string) => (src === '/img.png' ? { lines: [' '], tiles: [[t]] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){align=right}', { cols: 4, rows: 2, image })
    const line = frame.lines[0]!
    expect(line.tiles?.[3]).toEqual(t)
    expect(line.tiles?.[0]).toBeNull()
  })

  it('draws a box-drawing ring around a {border} image, width as total footprint', () => {
    let requested: { cols?: number; rows?: number } = {}
    const image = (src: string, maxCols?: number, maxRows?: number) => {
      requested = { cols: maxCols, rows: maxRows }
      return src === '/img.png' ? { lines: ['##', '##'] } : null
    }
    const [frame] = paginateMarkdown('![alt](/img.png){width=4 border}', {
      cols: 6,
      rows: 6,
      image,
    })
    // Image resolves 2 cells smaller than the request on each axis.
    expect(requested).toEqual({ cols: 2, rows: 4 })
    // Bordered footprint is 4 cols, centered in 6: pad = 1.
    expect(texts(frame).slice(0, 4)).toEqual([' ┌──┐', ' │##│', ' │##│', ' └──┘'])
  })

  it('keeps border cells on the default palette (null color entries)', () => {
    const image = (src: string) =>
      src === '/img.png' ? { lines: ['#'], colors: [[{ fg: 'red', bg: 'blue' }]] } : null
    const [frame] = paginateMarkdown('![alt](/img.png){border align=left}', {
      cols: 6,
      rows: 4,
      image,
    })
    expect(texts(frame).slice(0, 3)).toEqual(['┌─┐', '│#│', '└─┘'])
    expect(frame.lines[1]!.colors?.[0]).toBeNull()
    expect(frame.lines[1]!.colors?.[1]).toEqual({ fg: 'red', bg: 'blue' })
    expect(frame.lines[1]!.colors?.[2]).toBeNull()
  })

  it('keeps border cells free of tiles (null entries around the ring)', () => {
    const t: ImageTileRef = { src: '/img.png', col: 0, row: 0, cols: 1, rows: 1 }
    const image = (src: string) => (src === '/img.png' ? { lines: [' '], tiles: [[t]] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){border align=left}', {
      cols: 6,
      rows: 4,
      image,
    })
    expect(frame.lines[1]!.tiles?.[0]).toBeNull()
    expect(frame.lines[1]!.tiles?.[1]).toEqual(t)
    expect(frame.lines[1]!.tiles?.[2]).toBeNull()
  })

  it('records a snake ring rect for a {border=snake} image', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##', '##'] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){width=4 align=left border=snake}', {
      cols: 6,
      rows: 6,
      image,
    })
    // Ring is the full bordered footprint (4×4) at the left edge, frame row 0.
    expect(frame.snakeRings).toEqual([{ row: 0, col: 0, width: 4, height: 4 }])
  })

  it('offsets the snake ring by preceding content and centering', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##', '##'] } : null)
    const [frame] = paginateMarkdown('Hi\n\n![alt](/img.png){width=4 border=snake}', {
      cols: 6,
      rows: 8,
      image,
    })
    // 'Hi' (row 0), blank separator (row 1), then the centered 4-wide ring at
    // row 2, col 1 (pad = (6-4)/2).
    expect(frame.snakeRings).toEqual([{ row: 2, col: 1, width: 4, height: 4 }])
  })

  it('does not record snake rings for a plain {border} image', () => {
    const image = (src: string) => (src === '/img.png' ? { lines: ['##', '##'] } : null)
    const [frame] = paginateMarkdown('![alt](/img.png){width=4 align=left border}', {
      cols: 6,
      rows: 6,
      image,
    })
    expect(frame.snakeRings).toBeUndefined()
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

  it('carries image tiles on the float rows only', () => {
    const tile = (col: number, row: number): ImageTileRef => ({
      src: '/i.png',
      col,
      row,
      cols: 2,
      rows: 2,
    })
    const image = (src: string) =>
      src === '/i.png'
        ? {
            lines: ['  ', '  '],
            tiles: [
              [tile(0, 0), tile(1, 0)],
              [tile(0, 1), tile(1, 1)],
            ],
          }
        : null
    const [frame] = paginateMarkdown(`![a](/i.png){width=2 align=left}\n\n${LONG}`, {
      cols: 20,
      rows: 12,
      image,
    })
    expect(frame.lines[0]!.tiles?.[0]).toEqual(tile(0, 0))
    // Rows below the image (index >= 2) carry no tiles.
    expect(frame.lines[2]!.tiles).toBeUndefined()
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

  it('floats a bordered image at its total (ring-inclusive) width', () => {
    let requestedCols: number | undefined
    const image = (src: string, maxCols?: number) => {
      requestedCols = maxCols
      return src === '/i.png' ? { lines: ['###', '###'] } : null
    }
    const [frame] = paginateMarkdown(`![a](/i.png){width=5 align=left border}\n\n${LONG}`, {
      cols: 24,
      rows: 12,
      image,
    })
    expect(requestedCols).toBe(3) // width=5 minus one border cell per side
    const t = texts(frame)
    expect(t[0]!.slice(0, 5)).toBe('┌───┐')
    // Text starts past the bordered image (5) + gutter (2).
    expect(t[0]!.slice(5, 7)).toBe('  ')
    expect(t[0]!.slice(7)).not.toBe('')
    expect(t[3]!.slice(0, 5)).toBe('└───┘')
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

  it('parses a bare border flag alongside other attrs', () => {
    expect(parseImageAttrs('border')).toEqual({ align: 'center', border: true })
    expect(parseImageAttrs('width=12 border align=left')).toEqual({
      width: 12,
      align: 'left',
      border: true,
    })
  })

  it('does not treat "border" inside another token as the flag', () => {
    expect(parseImageAttrs('align=border')).toEqual({ align: 'center' })
    expect(parseImageAttrs('borderline')).toEqual({ align: 'center' })
  })

  it('parses border=snake as a snake border (implying border)', () => {
    expect(parseImageAttrs('border=snake')).toEqual({ align: 'center', border: true, snake: true })
    expect(parseImageAttrs('width=8 align=left border=snake')).toEqual({
      width: 8,
      align: 'left',
      border: true,
      snake: true,
    })
  })

  it('treats border with any other value as a plain ring (no snake)', () => {
    expect(parseImageAttrs('border=plain')).toEqual({ align: 'center', border: true })
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
