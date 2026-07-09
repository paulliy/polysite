/**
 * Drives the border snake (engine/snake.ts) for whichever `{border=snake}` image
 * the pointer is currently over. This is the DOM/Vue-reactive wrapper around the
 * pure engine pieces (per CLAUDE.md, engine/ stays framework-free):
 *
 * - It reads the visible frame's authored snake rings from the store
 *   (`board.snakeRings`, already in global board coordinates) and precomputes
 *   each ring's clockwise cell path (`borderRingPath`). Only rings authored with
 *   `{border=snake}` appear there, so a plain `{border}` never animates.
 * - On pointer hover over a snake ring (its border or the image it frames) it
 *   starts a snake; a step timer advances it and paints the snake's faces into
 *   `board.overrides`. BoardCell turns each override change into a flap, so the
 *   snake reads as split-flap motion, not a marquee.
 * - It stops and clears its overlay when the pointer leaves, the visible rings
 *   change (route / scroll / resize), or the board unmounts. It never runs while
 *   the board is loading or under reduced motion.
 */

import { onBeforeUnmount, watch } from 'vue'
import {
  SNAKE_MAX_LENGTH_FRACTION,
  SNAKE_MIN_RING_CELLS,
  SNAKE_START_LENGTH,
  SNAKE_STEP_MS,
} from '@/config'
import { borderRingPath, type RingCell } from '@/engine/border'
import { createSnake, snakeFaces, stepSnake, type SnakeState } from '@/engine/snake'
import type { BorderRect } from '@/engine/types'
import type { useBoardStore } from '@/stores/board'

type BoardStore = ReturnType<typeof useBoardStore>

interface Ring {
  /** Global-coordinate bounds (nav offset already applied by the store). */
  top: number
  left: number
  bottom: number
  right: number
  /** Clockwise perimeter cells, in global coordinates. */
  path: RingCell[]
}

export function useSnakeGame(board: BoardStore) {
  let rings: Ring[] = []
  let activeRing: Ring | null = null
  let state: SnakeState | null = null
  let timer: ReturnType<typeof setInterval> | undefined
  /** Keys we painted last step, so we can clear the ones the snake left behind. */
  const painted = new Set<string>()

  function clearPainted() {
    for (const key of painted) board.clearOverride(key)
    painted.clear()
  }

  function stop() {
    if (timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
    clearPainted()
    activeRing = null
    state = null
  }

  /** Paint the snake's current faces, clearing the cells it vacated. */
  function render() {
    if (!activeRing || !state) return
    const faces = snakeFaces(state)
    const next = new Set<string>()
    for (const [index, face] of faces) {
      const cell = activeRing.path[index]
      if (!cell) continue
      const key = `${cell.row}:${cell.col}`
      board.setOverride(key, face)
      next.add(key)
    }
    for (const key of painted) if (!next.has(key)) board.clearOverride(key)
    painted.clear()
    for (const key of next) painted.add(key)
  }

  function start(ring: Ring) {
    stop()
    if (board.loading || board.reducedMotion) return
    if (ring.path.length < SNAKE_MIN_RING_CELLS) return
    activeRing = ring
    const maxLength = Math.max(
      SNAKE_START_LENGTH + 1,
      Math.floor(ring.path.length * SNAKE_MAX_LENGTH_FRACTION),
    )
    state = createSnake(ring.path.length, SNAKE_START_LENGTH, maxLength)
    render()
    timer = setInterval(() => {
      if (!state) return
      state = stepSnake(state)
      render()
    }, SNAKE_STEP_MS)
  }

  function ringAt(row: number, col: number): Ring | null {
    for (const ring of rings) {
      if (row >= ring.top && row <= ring.bottom && col >= ring.left && col <= ring.right) {
        return ring
      }
    }
    return null
  }

  function leave() {
    if (activeRing) stop()
  }

  function onPointerMove(event: PointerEvent) {
    const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('.cell')
    if (!el) return leave()
    const row = Number(el.dataset.row)
    const col = Number(el.dataset.col)
    if (!Number.isFinite(row) || !Number.isFinite(col)) return leave()
    const ring = ringAt(row, col)
    if (!ring) return leave()
    // Same ring we're already animating — keep going (identity is stable while
    // the visible rings don't change, so this doesn't restart on every move).
    if (ring !== activeRing) start(ring)
  }

  // The visible frame's authored snake rings (route / scroll / resize all change
  // them). Stop the current snake, then rebuild the hover targets + their paths.
  watch(
    () => board.snakeRings,
    (rects: BorderRect[]) => {
      stop()
      rings = rects.map((rect) => ({
        top: rect.row,
        left: rect.col,
        bottom: rect.row + rect.height - 1,
        right: rect.col + rect.width - 1,
        path: borderRingPath(rect),
      }))
    },
    { immediate: true },
  )

  onBeforeUnmount(stop)

  return { onPointerMove, onPointerLeave: leave }
}
