import { describe, it, expect } from 'vitest'
import { loadingMessageCells } from '@/engine/loadingMessage'
import { BLANK } from '@/engine/characterSet'

describe('loadingMessageCells', () => {
  it('centers the text on the middle row', () => {
    const cells = loadingMessageCells(10, 5, 'HI')
    // rows 5 → middle row floor((5-1)/2) = 2; cols 10, len 2 → startCol 4.
    expect(cells.get('2:4')).toBe('H')
    expect(cells.get('2:5')).toBe('I')
    expect(cells.size).toBe(2)
  })

  it('maps spaces to blank so words are separated by stillness', () => {
    const cells = loadingMessageCells(6, 1, 'A B')
    // len 3, cols 6 → startCol 1: cols 1,2,3.
    expect(cells.get('0:1')).toBe('A')
    expect(cells.get('0:2')).toBe(BLANK)
    expect(cells.get('0:3')).toBe('B')
  })

  it('returns empty when the text cannot fit the width', () => {
    expect(loadingMessageCells(3, 5, 'TOO LONG').size).toBe(0)
  })

  it('returns empty for empty text or a degenerate grid', () => {
    expect(loadingMessageCells(10, 5, '').size).toBe(0)
    expect(loadingMessageCells(0, 5, 'HI').size).toBe(0)
    expect(loadingMessageCells(10, 0, 'HI').size).toBe(0)
  })

  it('fits the default prompt on the mobile width', () => {
    const cells = loadingMessageCells(28, 34, 'CLICK TO START')
    expect(cells.size).toBeGreaterThan(0)
    // 14 chars incl. 2 spaces → 12 lettered cells.
    expect([...cells.values()].filter((c) => c !== BLANK)).toHaveLength(12)
  })
})
