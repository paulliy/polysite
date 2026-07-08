import { describe, it, expect } from 'vitest'
import { toSemanticBlocks } from '@/engine/paginate'
import { ICONS, expandIconShortcodes } from '@/engine/characterSet'

describe('toSemanticBlocks', () => {
  it('preserves headings with their level', () => {
    const [h1, h3] = toSemanticBlocks('# Title\n\n### Sub')
    expect(h1).toMatchObject({ kind: 'heading', level: 1 })
    expect(h1!.segments.map((s) => s.text).join('')).toBe('Title')
    expect(h3).toMatchObject({ kind: 'heading', level: 3 })
  })

  it('splits a paragraph into plain and link segments in order', () => {
    const [p] = toSemanticBlocks('see the [projects](/projects) page now')
    expect(p!.kind).toBe('paragraph')
    expect(p!.segments).toEqual([
      { text: 'see the ' },
      { text: 'projects', href: '/projects' },
      { text: ' page now' },
    ])
  })

  it('keeps the whole document, not just one frame of it', () => {
    const md = Array.from({ length: 30 }, (_, i) => `Paragraph ${i}.`).join('\n\n')
    const blocks = toSemanticBlocks(md)
    expect(blocks).toHaveLength(30)
    expect(blocks.at(-1)!.segments[0]!.text).toBe('Paragraph 29.')
  })

  it('emits list items with their inline links', () => {
    const blocks = toSemanticBlocks('- first\n- see [more](/more)')
    expect(blocks.map((b) => b.kind)).toEqual(['listItem', 'listItem'])
    expect(blocks[1]!.segments).toEqual([{ text: 'see ' }, { text: 'more', href: '/more' }])
  })

  it('strips emphasis and normalizes typography in segments', () => {
    const [p] = toSemanticBlocks('a **bold** word — done…')
    expect(p!.segments.map((s) => s.text).join('')).toBe('a bold word - done...')
  })

  it('handles a link that spans the whole block', () => {
    const [p] = toSemanticBlocks('[email me](mailto:x@y.z)')
    expect(p!.segments).toEqual([{ text: 'email me', href: 'mailto:x@y.z' }])
  })

  it('omits level on non-heading blocks', () => {
    const [p] = toSemanticBlocks('just a paragraph')
    expect(p!.level).toBeUndefined()
  })

  it('strips decorative icon faces from readable text', () => {
    const [item] = toSemanticBlocks('- [:github: github](https://x)')
    // The icon is dropped; the link keeps its real label.
    expect(item!.segments).toEqual([{ text: 'github', href: 'https://x' }])
  })

  it('falls back to an icon label for an icon-only link', () => {
    const [item] = toSemanticBlocks('- [:linkedin:](https://x)')
    expect(item!.segments).toEqual([{ text: 'LinkedIn', href: 'https://x' }])
  })
})

describe('expandIconShortcodes', () => {
  it('replaces :name: tokens with single icon faces', () => {
    expect(expandIconShortcodes(':github:')).toBe(ICONS.github)
    expect(expandIconShortcodes('a :mail: b')).toBe(`a ${ICONS.email} b`)
  })

  it('leaves unknown or malformed shortcodes untouched', () => {
    expect(expandIconShortcodes(':nope: :mail')).toBe(':nope: :mail')
  })
})
