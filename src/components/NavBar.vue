<script setup lang="ts">
import { onMounted } from 'vue'
import { useBoardStore } from '@/stores/board'
import BoardCell from './BoardCell.vue'
import type { Line, LinkSpan } from '@/engine/types'

/**
 * Persistent nav bar occupying the board's fixed top rows (CLAUDE.md #5) —
 * a title row with page links, over a rule line, like a departure board
 * header. Rendered from the same cell model as everything else so nav
 * changes can flip like any other cells later.
 */

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'About', href: '/about' },
]

const TITLE = 'POLYSITE'
const ITEM_GAP = 2

function buildNavLines(cols: number): Line[] {
  const menu = NAV_ITEMS.map((i) => i.label).join(' '.repeat(ITEM_GAP))
  // Title left, menu right; drop the title if the board is too narrow.
  const showTitle = TITLE.length + 1 + menu.length <= cols
  const pad = cols - menu.length - (showTitle ? TITLE.length : 0)
  const text = (showTitle ? TITLE : '') + ' '.repeat(Math.max(1, pad)) + menu

  const links: LinkSpan[] = []
  let cursor = text.length - menu.length
  for (const item of NAV_ITEMS) {
    links.push({ start: cursor, end: cursor + item.label.length, href: item.href })
    cursor += item.label.length + ITEM_GAP
  }

  return [
    { text, kind: 'heading', links },
    { text: '-'.repeat(cols), kind: 'body', links: [] },
  ]
}

const board = useBoardStore()

onMounted(() => {
  board.setNav(buildNavLines(board.cols))
})
</script>

<template>
  <div class="nav" role="presentation">
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
