/**
 * Drives the border snake (engine/snake.ts) for whichever bordered image the
 * pointer is currently over. This is the DOM/Vue-reactive wrapper around the
 * pure engine pieces (per CLAUDE.md, engine/ stays framework-free):
 *
 * - It reads the committed board to locate drawn border rings
 *   (`detectBorderRings`) and precomputes each ring's clockwise cell path
 *   (`borderRingPath`), in global board coordinates.
 * - On pointer hover over a ring (border or the image it frames) it starts a
 *   snake there; a step timer advances it and paints the snake's faces into
 *   `board.overrides`. BoardCell turns each override change into a flap, so the
 *   snake reads as split-flap motion, not a marquee.
 * - On leave, route change, scroll, grid resize, or unmount it stops and clears
 *   its overlay, restoring the plain border. It never runs while the board is
 *   loading or under reduced motion.
 */

import { onBeforeUnmount, watch } from 'vue'
import {
  NAV_ROWS,
  SNAKE_MAX_LENGTH_FRACTION,
  SNAKE_MIN_RING_CELLS,
  SNAKE_START_LENGTH,
  SNAKE_STEP_MS,
} from '@/config'
import { borderRingPath, detectBorderRings, type RingCell } from '@/engine/border'
import { createSnake, snakeFaces, stepSnake, type SnakeState } from '@/engine/snake'
import type { useBoardStore } from '@/stores/board'

type BoardStore = ReturnType<typeof useBoardStore>

interface Ring {
  /** Global-coordinate bounds (nav offset already applied). */
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

  /** Re-scan the committed content grid for border rings (global coordinates).
   *  Content cells start at row NAV_ROWS, so ring rows are offset to match the
   *  `${globalRow}:${col}` keys BoardCell reads from `board.overrides`. */
  function recomputeRings(): Ring[] {
    const grid = board.contentRows.map((row) => row.map((cell) => cell.face))
    return detectBorderRings(grid).map((rect) => {
      const top = rect.row + NAV_ROWS
      const left = rect.col
      const path = borderRingPath({ ...rect, row: top })
      return { top, left, bottom: top + rect.height - 1, right: left + rect.width - 1, path }
    })
  }

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
    // Same ring we're already animating — keep going (identity is stable between
    // recomputes, so this doesn't restart on every mousemove).
    if (ring !== activeRing) start(ring)
  }

  // Any change to what the board shows (route, scroll frame, grid size, or the
  // loading reveal) can move or remove a ring — stop, then rescan. `flush: post`
  // so the content cells reflect the just-committed frame.
  watch(
    () => [board.frameCount, board.position, board.cols, board.rowCount, board.loading] as const,
    () => {
      stop()
      rings = recomputeRings()
    },
    { immediate: true, flush: 'post' },
  )

  onBeforeUnmount(stop)

  return { onPointerMove, onPointerLeave: leave }
}
