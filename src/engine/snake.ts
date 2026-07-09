/**
 * The border "snake": pure, framework-free game state for the animation that
 * plays while a bordered image is hovered. The snake travels a ring's perimeter
 * (an ordered cell path from engine/border.ts's `borderRingPath`), eats an
 * apple, grows one segment per apple, and — on reaching its length cap — resets
 * to a single segment for a fresh lap.
 *
 * This module knows nothing about the board, cells, flips, or DOM. It works in
 * terms of *path indices* (0…pathLength-1 around the ring); the driver
 * (composables/useSnakeGame.ts) maps those to board cells and drives the flap
 * animation, so the visible snake still obeys the split-flap philosophy —
 * segments flip in as the head arrives and flip out as the tail leaves.
 *
 * All randomness is injected (`Rng`) so stepping is deterministic and unit-
 * testable.
 */

import { BLOCK, ICONS } from './characterSet'

/** The face a snake segment (head or body) shows — a solid full-cell block. */
export const SNAKE_FACE = BLOCK
/** The face the apple shows (a real icon glyph, off-white per CLAUDE.md rule 6). */
export const APPLE_FACE = ICONS.apple

/** `() => [0, 1)`, injected so apple placement is deterministic in tests. */
export type Rng = () => number

export interface SnakeState {
  /** Number of cells in the ring the snake travels. */
  pathLength: number
  /** Path indices the snake occupies, head first, tail last. */
  body: number[]
  /** Path index of the apple, or -1 when the ring has no free cell for one. */
  apple: number
  /** Length at which the snake resets to a single segment (the lap cap). */
  maxLength: number
}

const mod = (n: number, m: number) => ((n % m) + m) % m

/** A path index not currently under the snake, chosen uniformly at random;
 *  -1 when the snake fills the ring (no free cell). */
function placeApple(pathLength: number, body: number[], rng: Rng): number {
  const occupied = new Set(body)
  const free: number[] = []
  for (let i = 0; i < pathLength; i++) if (!occupied.has(i)) free.push(i)
  if (free.length === 0) return -1
  return free[Math.floor(rng() * free.length)] ?? -1
}

/**
 * A fresh snake of `startLength` segments with its head at path index 0 and the
 * body trailing backward along the ring, plus an apple placed on a free cell.
 * `maxLength` is clamped into `(startLength, pathLength)` so a lap always both
 * grows and eventually resets.
 */
export function createSnake(
  pathLength: number,
  startLength: number,
  maxLength: number,
  rng: Rng = Math.random,
): SnakeState {
  const len = Math.max(1, Math.min(startLength, pathLength))
  const body: number[] = []
  for (let i = 0; i < len; i++) body.push(mod(-i, pathLength))
  const cap = Math.max(len + 1, Math.min(maxLength, pathLength - 1))
  return { pathLength, body, apple: placeApple(pathLength, body, rng), maxLength: cap }
}

/**
 * Advance the snake one cell along the ring, returning a new state (the input
 * is never mutated):
 * - at the length cap, reset to a single-segment snake for a new lap;
 * - otherwise move the head forward one cell, growing (keeping the tail) when it
 *   lands on the apple and respawning the apple, or dropping the tail when it
 *   doesn't.
 */
export function stepSnake(state: SnakeState, rng: Rng = Math.random): SnakeState {
  const { pathLength, maxLength } = state
  const head = state.body[0] ?? 0

  // Reached the cap last step — snap back to one segment and start over.
  if (state.body.length >= maxLength) {
    const body = [head]
    return { pathLength, body, apple: placeApple(pathLength, body, rng), maxLength }
  }

  const nextHead = mod(head + 1, pathLength)
  const ate = nextHead === state.apple
  const body = ate ? [nextHead, ...state.body] : [nextHead, ...state.body.slice(0, -1)]
  return {
    pathLength,
    body,
    apple: ate ? placeApple(pathLength, body, rng) : state.apple,
    maxLength,
  }
}

/**
 * The overlay faces the snake paints this frame, as `pathIndex → face`. The
 * driver maps each path index to a board cell. Head and body share `SNAKE_FACE`
 * (a segment never changes face as the head passes over it, so those cells
 * don't re-flip); the apple gets `APPLE_FACE`.
 */
export function snakeFaces(state: SnakeState): Map<number, string> {
  const faces = new Map<number, string>()
  if (state.apple >= 0) faces.set(state.apple, APPLE_FACE)
  for (const index of state.body) faces.set(index, SNAKE_FACE)
  return faces
}
