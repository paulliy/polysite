/**
 * Ripple timing math (CLAUDE.md #3): maps a cell's normalized depth on the
 * board (0 = top row, 1 = bottom row) to a normalized position in time
 * (0 = fires immediately, 1 = fires at the end of the sweep). Multiplying by
 * a duration in ms gives the cell's ripple delay. Plain, framework-agnostic
 * TypeScript — no Vue imports.
 */

export type RippleCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export const RIPPLE_CURVES: readonly RippleCurve[] = [
  'linear',
  'ease-in',
  'ease-out',
  'ease-in-out',
]

/** Shapes how the ripple's delay is distributed across row depth `t` (0..1). */
function curveEase(curve: RippleCurve, t: number): number {
  switch (curve) {
    case 'ease-in':
      return t * t
    case 'ease-out':
      return 1 - (1 - t) * (1 - t)
    case 'ease-in-out':
      return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    case 'linear':
    default:
      return t
  }
}

/**
 * The ripple delay, in ms, for a cell at normalized row depth `rowFraction`
 * (0 = top, 1 = bottom), given a total sweep `durationMs` and `curve` shape.
 */
export function rippleDelayMs(rowFraction: number, durationMs: number, curve: RippleCurve): number {
  const t = Math.min(Math.max(rowFraction, 0), 1)
  return durationMs * curveEase(curve, t)
}
