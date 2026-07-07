import { describe, it, expect } from 'vitest'
import { diffGrids, emptyGrid } from '@/engine/cellDiff'

const STAGGER = 18

function gridOf(rows: string[]): string[][] {
  return rows.map((r) => [...r])
}

describe('diffGrids', () => {
  it('returns no changes for identical grids', () => {
    const a = gridOf(['ab', 'cd'])
    const b = gridOf(['ab', 'cd'])
    expect(diffGrids(a, b, STAGGER)).toEqual([])
  })

  it('never reports blank-to-blank cells', () => {
    const a = gridOf(['  ', ' x'])
    const b = gridOf(['  ', ' y'])
    const changes = diffGrids(a, b, STAGGER)
    expect(changes).toHaveLength(1)
    expect(changes[0]).toMatchObject({ row: 1, col: 1, from: 'x', to: 'y' })
  })

  it('reports only changed cells, including to/from blank', () => {
    const a = gridOf(['abc'])
    const b = gridOf(['a c'])
    const changes = diffGrids(a, b, STAGGER)
    expect(changes).toEqual([{ row: 0, col: 1, from: 'b', to: ' ', delayMs: 0 }])
  })

  it('orders changes row-major for the top-to-bottom ripple', () => {
    const a = emptyGrid(3, 3)
    const b = gridOf(['x x', ' x ', 'x x'])
    const changes = diffGrids(a, b, STAGGER)
    const positions = changes.map((c) => [c.row, c.col])
    expect(positions).toEqual([
      [0, 0],
      [0, 2],
      [1, 1],
      [2, 0],
      [2, 2],
    ])
  })

  it('staggers delays by row, uniformly within a row', () => {
    const a = emptyGrid(3, 2)
    const b = gridOf(['xx', 'xx', 'xx'])
    const changes = diffGrids(a, b, STAGGER)
    for (const change of changes) {
      expect(change.delayMs).toBe(change.row * STAGGER)
    }
  })

  it('throws on mismatched dimensions', () => {
    expect(() => diffGrids(emptyGrid(2, 2), emptyGrid(3, 2), STAGGER)).toThrow(/row count/)
    expect(() => diffGrids(gridOf(['ab']), gridOf(['abc']), STAGGER)).toThrow(/col count/)
  })
})

describe('emptyGrid', () => {
  it('builds a blank grid of the requested size', () => {
    const grid = emptyGrid(2, 3)
    expect(grid).toHaveLength(2)
    expect(grid[0]).toEqual([' ', ' ', ' '])
    expect(grid[0]).not.toBe(grid[1]) // rows must not share identity
  })
})
