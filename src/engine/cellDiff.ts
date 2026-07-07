/**
 * Grid diffing (CLAUDE.md #1–#3): only cells whose face actually changes flip
 * — untouched cells, including blank-to-blank, are never reported. Changes
 * come back in row-major order with per-row stagger delays so multi-cell
 * updates ripple top-to-bottom.
 */

import type { CellChange } from './types'

export function emptyGrid(rows: number, cols: number, fill = ' '): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill))
}

export function diffGrids(
  current: string[][],
  target: string[][],
  rowStaggerMs: number,
): CellChange[] {
  if (current.length !== target.length) {
    throw new Error(`grid row count mismatch: ${current.length} vs ${target.length}`)
  }

  const changes: CellChange[] = []
  for (let row = 0; row < current.length; row++) {
    const currentRow = current[row] ?? []
    const targetRow = target[row] ?? []
    if (currentRow.length !== targetRow.length) {
      throw new Error(
        `grid col count mismatch in row ${row}: ${currentRow.length} vs ${targetRow.length}`,
      )
    }
    for (let col = 0; col < currentRow.length; col++) {
      const from = currentRow[col] ?? ''
      const to = targetRow[col] ?? ''
      if (from !== to) {
        changes.push({ row, col, from, to, delayMs: row * rowStaggerMs })
      }
    }
  }
  return changes
}
