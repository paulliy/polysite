<script setup lang="ts">
import { ref, watch } from 'vue'
import { useBoardStore } from '@/stores/board'
import BoardCell from './BoardCell.vue'
import type { Line, LinkSpan } from '@/engine/types'

/**
 * Persistent nav bar occupying the board's fixed top rows (CLAUDE.md #5) —
 * a title row with page links, over a rule line, like a departure board
 * header. Rendered from the same cell model as everything else, so hover
 * changes flip like any other cells:
 *  - hovering a menu item paints just that item navy (the CTA treatment);
 *  - hovering anywhere over the nav flips the rule line's dashes into carets
 *    pointing up at the menu.
 * Both revert (and flip back) when the pointer leaves.
 */

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/about' },
]

const TITLE = 'POLYSITE'
const ITEM_GAP = 2

/** href of the menu item currently under the pointer, if any (drives paint). */
const hoveredHref = ref<string | null>(null)
/** Column under the pointer while over the nav, else null (drives the caret). */
const hoveredCol = ref<number | null>(null)

function buildNavLines(cols: number, hovered: string | null, col: number | null): Line[] {
  const menu = NAV_ITEMS.map((i) => i.label).join(' '.repeat(ITEM_GAP))
  // Title left, menu right; drop the title if the board is too narrow.
  const showTitle = TITLE.length + 1 + menu.length <= cols
  const pad = cols - menu.length - (showTitle ? TITLE.length : 0)
  const text = (showTitle ? TITLE : '') + ' '.repeat(Math.max(1, pad)) + menu

  const links: LinkSpan[] = []
  let cursor = text.length - menu.length
  for (const item of NAV_ITEMS) {
    // Clickable always; painted navy only while hovered.
    links.push({
      start: cursor,
      end: cursor + item.label.length,
      href: item.href,
      paint: item.href === hovered,
    })
    cursor += item.label.length + ITEM_GAP
  }

  const span = links.find((l) => l.href === hovered)

  // Flank the hovered item with hyphens in the title row ("- Home -").
  const title = text.split('')
  if (span) {
    if (span.start - 1 >= 0) title[span.start - 1] = '-'
    if (span.end < cols) title[span.end] = '-'
  }

  // Carets point up at what the pointer is over: the full width of the hovered
  // menu item, or — when the pointer is over the nav but not an item — a single
  // caret under the cursor. Everything else stays a dash.
  const rule = Array.from({ length: cols }, () => '-')
  if (span) {
    for (let c = span.start; c < Math.min(span.end, cols); c++) rule[c] = '^'
  } else if (col !== null && col >= 0 && col < cols) {
    rule[col] = '^'
  }

  return [
    { text: title.join(''), kind: 'heading', links },
    { text: rule.join(''), kind: 'body', links: [] },
  ]
}

const board = useBoardStore()

// Rebuild the nav on mount, when the column count changes (the board crossed
// the mobile breakpoint), and whenever the hover state changes. setNav diffs,
// so only the cells that actually change (the hovered item + the caret) flip.
watch(
  [() => board.cols, hoveredHref, hoveredCol],
  ([cols]) => board.setNav(buildNavLines(cols, hoveredHref.value, hoveredCol.value)),
  { immediate: true },
)

// Hover is a post-load affordance; during the loading intro the nav is held
// behind the noise, so don't retarget it (which would reveal a caret rule).
function onMove(event: PointerEvent) {
  if (board.loading) return
  const cell = (event.target as HTMLElement | null)?.closest('.cell') as HTMLElement | null
  if (!cell) {
    hoveredHref.value = null
    hoveredCol.value = null
    return
  }
  hoveredHref.value = cell.dataset.href ?? null
  const col = cell.dataset.col
  hoveredCol.value = col === undefined ? null : Number(col)
}
function onLeave() {
  hoveredHref.value = null
  hoveredCol.value = null
}
</script>

<template>
  <div class="nav" role="presentation" @pointermove="onMove" @pointerleave="onLeave">
    <div v-for="(row, r) in board.navRows" :key="r" class="nav-row">
      <BoardCell v-for="(cell, c) in row" :key="c" :cell="cell" :row="r" :col="c" />
    </div>
  </div>
</template>

<style scoped>
.nav-row {
  display: flex;
}
</style>
