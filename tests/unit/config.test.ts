import { describe, it, expect } from 'vitest'
import {
  FOOTER_ROWS,
  GRID_COLS,
  GRID_ROWS,
  NAV_ROWS,
  MOBILE_GRID_COLS,
  FLIP_HOP_MS,
  FLIP_INTERMEDIATE_MIN,
  FLIP_INTERMEDIATE_MAX,
  LOADING_MIN_DURATION_MS,
  IMAGE_BLOCK_SIZE,
} from '@/config'

describe('config constants', () => {
  it('defines a usable grid', () => {
    expect(GRID_COLS).toBeGreaterThan(0)
    expect(GRID_ROWS).toBeGreaterThan(0)
  })

  it('reserves nav and footer rows but leaves room for content', () => {
    expect(NAV_ROWS).toBeGreaterThan(0)
    expect(FOOTER_ROWS).toBeGreaterThanOrEqual(0)
    expect(NAV_ROWS + FOOTER_ROWS).toBeLessThan(GRID_ROWS)
  })

  it('narrows (never widens) the grid on mobile', () => {
    expect(MOBILE_GRID_COLS).toBeGreaterThan(0)
    expect(MOBILE_GRID_COLS).toBeLessThanOrEqual(GRID_COLS)
  })

  it('keeps timing and pixelation constants sane', () => {
    expect(FLIP_HOP_MS).toBeGreaterThan(0)
    expect(FLIP_INTERMEDIATE_MIN).toBeGreaterThanOrEqual(1)
    expect(FLIP_INTERMEDIATE_MAX).toBeGreaterThanOrEqual(FLIP_INTERMEDIATE_MIN)
    expect(LOADING_MIN_DURATION_MS).toBeGreaterThan(0)
    expect(IMAGE_BLOCK_SIZE).toBeGreaterThanOrEqual(1)
  })
})
