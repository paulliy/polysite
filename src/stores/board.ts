import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  FLIP_HOP_MS,
  FLIP_INTERMEDIATE_TOP_MIN,
  FLIP_INTERMEDIATE_TOP_MAX,
  FLIP_INTERMEDIATE_BOTTOM_MIN,
  FLIP_INTERMEDIATE_BOTTOM_MAX,
  FOOTER_ROWS,
  GRID_COLS,
  GRID_ROWS,
  LOADING_MESSAGE,
  NAV_FLIP_SPIN_FRACTION,
  NAV_ROWS,
  RIPPLE_DURATION_MS,
  RIPPLE_CURVE,
} from '@/config'
import { BLANK, normalizeChar, randomSpinFace } from '@/engine/characterSet'
import { loadingMessageCells } from '@/engine/loadingMessage'
import { diffGrids } from '@/engine/cellDiff'
import { rippleDelayMs } from '@/engine/ripple'
import { timingScaleFor, type DeviceClass } from '@/engine/deviceClass'
import { scheduleClacks } from '@/audio/clack'
import type { CellColor, Frame, ImageTileRef, Line } from '@/engine/types'

/** One rendered flap cell: its current face plus link/heading treatment. */
export interface BoardCellState {
  face: string
  href: string | null
  heading: boolean
  /**
   * Paint as a navy CTA. Decoupled from `href` so a nav link can be clickable
   * yet unpainted until hovered (NavBar), while content CTAs stay painted.
   */
  link: boolean
  /** Rendered with a heavier font-weight (markdown `**bold**`). */
  bold: boolean
  /** Rendered with an italic font-style (markdown `*italic*`). */
  italic: boolean
  /**
   * Per-cell color for image cells (CLAUDE.md rule 6's one exception); null for
   * ordinary cells, which use the default off-white-on-black palette.
   */
  color: CellColor | null
  /**
   * Image-tile slice for tile-slice image cells (CLAUDE.md rule 6); null for
   * ordinary cells. When set, the cell shows a slice of the real image via CSS
   * background-position/-size instead of a glyph (see engine/imageTile.ts).
   */
  tile: ImageTileRef | null
}

/** An in-progress flip on one cell. */
export interface CellFlip {
  from: BoardCellState
  /**
   * The full flap sequence rendered hop by hop: old face, a few
   * category-matched random intermediates, then the target face. The store
   * owns this so the animation and the per-hop clack track stay in lockstep.
   */
  faces: string[]
  delayMs: number
  /** Changes on every retrigger so Vue restarts the CSS animation. */
  serial: number
}

/**
 * How many intermediate faces a flip at `rowFraction` (0 = top row, 1 =
 * bottom row) gets: the [min, max] draw range is interpolated between the
 * TOP and BOTTOM config endpoints, so deeper rows flap through more.
 */
function intermediateCount(rowFraction: number, hopScale = 1): number {
  const lerp = (a: number, b: number) => a + (b - a) * rowFraction
  const min = Math.round(lerp(FLIP_INTERMEDIATE_TOP_MIN, FLIP_INTERMEDIATE_BOTTOM_MIN))
  // Scale only the ceiling by the device tier, then floor at `min` so a low
  // tier draws fewer flaps without ever going below the top-tier floor.
  const scaledMax = Math.round(lerp(FLIP_INTERMEDIATE_TOP_MAX, FLIP_INTERMEDIATE_BOTTOM_MAX) * hopScale)
  const hi = Math.max(min, scaledMax)
  return min + Math.floor(Math.random() * (hi - min + 1))
}

/**
 * old face → a few category-matched random intermediates → target face.
 * The intermediate count scales with the cell's depth via `rowFraction`.
 * This is the single source of truth for the sequence — BoardCell renders
 * it and the clack track times off it, so sound and animation stay locked.
 */
function buildFaceSequence(from: string, to: string, rowFraction: number, hopScale = 1): string[] {
  const spins = intermediateCount(rowFraction, hopScale)
  const sequence = [from]
  for (let i = 0; i < spins; i++) {
    const face = randomSpinFace(sequence[sequence.length - 1] ?? from, to)
    if (face) sequence.push(face)
  }
  sequence.push(to)
  return sequence
}

/** Whether column `col` falls inside any span in `spans` (bold/italic ranges). */
function inSpan(spans: Array<{ start: number; end: number }> | undefined, col: number): boolean {
  return spans?.some((s) => col >= s.start && col < s.end) ?? false
}

function lineToCells(line: Line | undefined, cols: number): BoardCellState[] {
  const cells: BoardCellState[] = []
  for (let col = 0; col < cols; col++) {
    const char = line?.text[col]
    const link = line?.links.find((l) => col >= l.start && col < l.end)
    cells.push({
      face: char === undefined ? BLANK : normalizeChar(char),
      href: link?.href ?? null,
      heading: line?.kind === 'heading',
      link: link ? (link.paint ?? true) : false,
      bold: inSpan(line?.bold, col),
      italic: inSpan(line?.italic, col),
      color: line?.colors?.[col] ?? null,
      tile: line?.tiles?.[col] ?? null,
    })
  }
  return cells
}

/**
 * A cell's flap identity for diffing: character plus paint. A real split-flap
 * can only change its background (navy link), weight (heading/bold), or slant
 * (italic) by flipping to a different flap, so style changes flip even when
 * the character — often a blank inside a link span — stays the same.
 * Identical face AND paint never animates.
 */
function cellKeysOf(rows: BoardCellState[][]): string[][] {
  return rows.map((row) =>
    row.map(
      (cell) =>
        `${cell.face} ${cell.link ? 'L' : ''}${cell.heading ? 'H' : ''}` +
        `${cell.bold ? 'B' : ''}${cell.italic ? 'I' : ''}` +
        // Color is part of a cell's flap identity too: an image cell that keeps
        // its glyph but changes color must still flip to the new color.
        (cell.color ? ` ${cell.color.fg}|${cell.color.bg}` : '') +
        // Likewise the tile slice: tile cells share a blank face, so without
        // the slice identity a different image (or a different offset within
        // the same image) would diff as unchanged and never flip.
        (cell.tile
          ? ` ${cell.tile.src}#${cell.tile.col}/${cell.tile.row}@${cell.tile.cols}x${cell.tile.rows}`
          : ''),
    ),
  )
}

/**
 * The board: a persistent nav region (top rows) over a content region and a
 * scroll-indicator footer. Every change goes through commit(), which diffs
 * the whole board — only cells whose face changes get a flip, delays ripple
 * top-to-bottom by global row (CLAUDE.md #1–#3).
 */
export const useBoardStore = defineStore('board', () => {
  const cols = ref(GRID_COLS)
  const contentRowCount = ref(GRID_ROWS - NAV_ROWS - FOOTER_ROWS)

  const blankRows = (count: number) =>
    Array.from({ length: count }, () => lineToCells(undefined, cols.value))

  const navRows = ref<BoardCellState[][]>(blankRows(NAV_ROWS))
  const contentRows = ref<BoardCellState[][]>(blankRows(contentRowCount.value))
  const footerRows = ref<BoardCellState[][]>(blankRows(FOOTER_ROWS))

  const rowCount = computed(
    () => navRows.value.length + contentRows.value.length + footerRows.value.length,
  )

  /** The current page's frames and the virtual scroll position within them. */
  const frames = ref<Frame[]>([])
  const position = ref(0)
  const frameCount = computed(() => frames.value.length)

  /** In-flight flips keyed by `${globalRow}:${col}`. */
  const flips = ref(new Map<string, CellFlip>())
  let flipSerial = 0

  /**
   * Transient overlay faces keyed by `${globalRow}:${col}`, driven by the border
   * snake (composables/useSnakeGame.ts) — the desired face for a ring cell while
   * the snake occupies it, layered *over* its committed content face without
   * touching it. commit()/diffing never read or write this; BoardCell flips to
   * an override when it appears and back to the content face when it clears, so
   * the snake obeys the flap philosophy without corrupting the page. Mutated
   * per-key (like `flips`) so only the changed cells re-render.
   */
  const overrides = ref(new Map<string, string>())
  function setOverride(key: string, face: string) {
    overrides.value.set(key, face)
  }
  function clearOverride(key: string) {
    overrides.value.delete(key)
  }
  function clearOverrides() {
    if (overrides.value.size > 0) overrides.value.clear()
  }

  /**
   * Resize the board to a new column/row count (viewport crossed the mobile
   * breakpoint). Rebuilds every region as blanks of the new size and clears
   * transient state; the caller re-paginates and commits the current page,
   * which flips the content back in from blank. Diffing never spans two sizes.
   */
  function setGrid(newCols: number, totalRows: number) {
    const newContentRows = Math.max(1, totalRows - NAV_ROWS - FOOTER_ROWS)
    if (newCols === cols.value && newContentRows === contentRowCount.value) return
    cols.value = newCols
    contentRowCount.value = newContentRows
    navRows.value = blankRows(NAV_ROWS)
    contentRows.value = blankRows(newContentRows)
    footerRows.value = blankRows(FOOTER_ROWS)
    flips.value = new Map()
    frames.value = []
    position.value = 0
  }

  /**
   * True until the loading intro completes. While loading, commit() applies
   * the real content to the cells silently — no flip records, no clacks — so
   * the board can hold the first frame *behind* the noise the cells animate
   * on their own (BoardCell). The reveal happens when this flips to false.
   */
  const loading = ref(true)

  /**
   * Set from the visitor's prefers-reduced-motion setting (App). When true the
   * board shows content directly: commit() applies faces but records no flips
   * and plays no clacks, so cells never animate (CLAUDE.md #11).
   */
  const reducedMotion = ref(false)

  /**
   * The visitor's detected device tier (App sets it synchronously at startup,
   * before the first cell mounts). Scales the board's animation work without
   * changing its character; `full` reproduces the base constants exactly.
   */
  const deviceClass = ref<DeviceClass>('full')
  const timingScale = computed(() => timingScaleFor(deviceClass.value))

  /**
   * `${globalRow}:${col}` → face for the cells that spell the loading prompt
   * (centered in the noise). BoardCell holds these static through the intro.
   */
  const loadingMessage = computed(() =>
    loadingMessageCells(cols.value, rowCount.value, LOADING_MESSAGE),
  )

  /** Whether a commit should animate (record flips + schedule clacks). */
  const animating = () => !loading.value && !reducedMotion.value

  /**
   * Swap the board to the target cells, recording a flip for every cell
   * whose face changes. Cells that keep their face — blank-to-blank
   * included — are untouched by diffGrids and never animate.
   */
  function commit(
    targetNav: BoardCellState[][],
    targetContent: BoardCellState[][],
    targetFooter: BoardCellState[][],
    // Depth fraction used for the *intermediate count* only (ripple delay still
    // follows real row depth). Nav passes this so its top-row flips still flap
    // through a few faces instead of settling instantly. Defaults to row depth.
    spinFraction?: number,
  ) {
    // `live` is the persistent reactive grid; `target` holds freshly computed
    // cell values. We diff, then mutate ONLY the changed live cells in place —
    // keeping array/object identity stable so Vue re-renders just those cells,
    // not all ~968 every commit. (setNav/navigation pass a region's own live
    // array as its target, so that region simply diffs empty.)
    const regions = [
      { live: navRows.value, target: targetNav, offset: 0 },
      { live: contentRows.value, target: targetContent, offset: NAV_ROWS },
      {
        live: footerRows.value,
        target: targetFooter,
        offset: NAV_ROWS + contentRowCount.value,
      },
    ]

    const totalRows = NAV_ROWS + contentRowCount.value + FOOTER_ROWS
    // Device tier scales the ripple's total sweep and each flip's hop count,
    // read once per commit so every cell in this change stays consistent.
    const scale = timingScale.value
    const rippleDuration = RIPPLE_DURATION_MS * scale.rippleDuration
    const nextFlips = new Map<string, CellFlip>()
    for (const { live, target, offset } of regions) {
      const changes = diffGrids(cellKeysOf(live), cellKeysOf(target), 0)
      for (const change of changes) {
        const liveCell = live[change.row]?.[change.col]
        const targetCell = target[change.row]?.[change.col]
        if (!liveCell || !targetCell) continue

        // While loading (or with reduced motion) apply the target face
        // silently — no flip/clack. Loading holds the real frame behind the
        // noise until the reveal; reduced motion shows content directly.
        if (animating()) {
          const globalRow = change.row + offset
          const rowFraction = totalRows > 1 ? globalRow / (totalRows - 1) : 0
          // Snapshot the old face for the flip's starting frame before mutating.
          const fromCell: BoardCellState = {
            face: liveCell.face,
            href: liveCell.href,
            heading: liveCell.heading,
            link: liveCell.link,
            bold: liveCell.bold,
            italic: liveCell.italic,
            color: liveCell.color,
            tile: liveCell.tile,
          }
          nextFlips.set(`${globalRow}:${change.col}`, {
            from: fromCell,
            faces: buildFaceSequence(
              fromCell.face,
              targetCell.face,
              spinFraction ?? rowFraction,
              scale.intermediateHops,
            ),
            delayMs: rippleDelayMs(rowFraction, rippleDuration, RIPPLE_CURVE),
            serial: ++flipSerial,
          })
        }
        liveCell.face = targetCell.face
        liveCell.href = targetCell.href
        liveCell.heading = targetCell.heading
        liveCell.link = targetCell.link
        liveCell.bold = targetCell.bold
        liveCell.italic = targetCell.italic
        liveCell.color = targetCell.color
        liveCell.tile = targetCell.tile
      }
    }

    if (!animating()) return

    // Merge, don't replace: a cell only (re)flips if THIS commit changed it,
    // and each flip clears itself on completion (completeFlip). Replacing the
    // whole map would cancel every in-flight flip on any later commit — so a
    // rapid series of hover commits (many of them no-ops) would snap the board
    // to its static faces instead of letting the flaps play out.
    for (const [key, cellFlip] of nextFlips) flips.value.set(key, cellFlip)

    // One clack per flap hop of every cell, at the moment that hop's rotation
    // lands (delay + (hop + 1) * hop duration) — the impact, not the start.
    const impactTimes: number[] = []
    for (const flip of nextFlips.values()) {
      for (let hop = 0; hop < flip.faces.length - 1; hop++) {
        impactTimes.push(flip.delayMs + (hop + 1) * FLIP_HOP_MS)
      }
    }
    scheduleClacks(impactTimes)
  }

  /** A flip finished; the cell renders its settled face again. */
  function completeFlip(row: number, col: number) {
    flips.value.delete(`${row}:${col}`)
  }

  /**
   * End the loading intro and reveal the content. Every cell flips from its
   * noise face to its real face on the top-to-bottom ripple (BoardCell.settle),
   * so we schedule a clack per cell at the moment its flap lands — the reveal
   * is heard as well as seen. (Browser autoplay policy still gates the very
   * first cold-load: audio only sounds once the visitor has interacted; see
   * src/audio/clack.ts.)
   */
  function finishLoading() {
    if (!loading.value) return
    loading.value = false
    // Reduced motion shows content directly — no reveal ripple, no cascade.
    if (reducedMotion.value) return

    const totalRows = NAV_ROWS + contentRowCount.value + FOOTER_ROWS
    // Reveal ripple uses the same tier-scaled sweep as BoardCell.settle.
    const rippleDuration = RIPPLE_DURATION_MS * timingScale.value.rippleDuration
    const impactTimes: number[] = []
    for (let row = 0; row < totalRows; row++) {
      const rowFraction = totalRows > 1 ? row / (totalRows - 1) : 0
      // Matches BoardCell.settle: ripple delay, then one hop lands the flap.
      const impact = rippleDelayMs(rowFraction, rippleDuration, RIPPLE_CURVE) + FLIP_HOP_MS
      for (let col = 0; col < cols.value; col++) impactTimes.push(impact)
    }
    scheduleClacks(impactTimes)
  }

  const footerCellsFor = (pos: number, count: number): BoardCellState[][] => {
    const paged = count > 1
    const down = paged && pos < count - 1
    const up = paged && pos > 0
    const arrowLine = (arrow: string, show: boolean) =>
      lineToCells(
        { text: show ? arrow.padStart(cols.value) : '', kind: 'body', links: [] },
        cols.value,
      )
    return [arrowLine('v', down), arrowLine('^', up)]
  }

  const contentCellsFor = (frame: Frame | undefined): BoardCellState[][] =>
    Array.from({ length: contentRowCount.value }, (_, r) =>
      lineToCells(frame?.lines[r], cols.value),
    )

  function setNav(lines: Line[]) {
    const target = lines.slice(0, NAV_ROWS).map((line) => lineToCells(line, cols.value))
    while (target.length < NAV_ROWS) target.push(lineToCells(undefined, cols.value))
    commit(target, contentRows.value, footerRows.value, NAV_FLIP_SPIN_FRACTION)
  }

  /** Replace the page content (route change): back to frame 0. */
  function setPage(newFrames: Frame[]) {
    frames.value = newFrames
    position.value = 0
    commit(
      navRows.value,
      contentCellsFor(newFrames[0]),
      footerCellsFor(0, newFrames.length),
    )
  }

  /** Step the virtual scroll position; clamps at either end of the page. */
  function advance(delta: number) {
    const next = Math.min(Math.max(position.value + delta, 0), frames.value.length - 1)
    if (next === position.value) return
    position.value = next
    commit(
      navRows.value,
      contentCellsFor(frames.value[next]),
      footerCellsFor(next, frames.value.length),
    )
  }

  return {
    cols,
    contentRowCount,
    navRows,
    contentRows,
    footerRows,
    rowCount,
    frames,
    position,
    frameCount,
    flips,
    overrides,
    setOverride,
    clearOverride,
    clearOverrides,
    loading,
    reducedMotion,
    deviceClass,
    timingScale,
    loadingMessage,
    setGrid,
    setNav,
    setPage,
    advance,
    completeFlip,
    finishLoading,
  }
})
