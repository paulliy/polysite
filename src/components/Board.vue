<script setup lang="ts">
import { NAV_ROWS } from '@/config'
import { useBoardStore } from '@/stores/board'
import BoardCell from './BoardCell.vue'
import NavBar from './NavBar.vue'

/**
 * The whole split-flap board: fixed-size character grid, nav rows on top,
 * content region below. Lives outside <router-view> (CLAUDE.md #4) so it
 * never unmounts on navigation.
 */

const board = useBoardStore()
</script>

<template>
  <div class="board-viewport">
    <div
      class="board"
      :style="{ '--cols': board.cols, '--rows': board.rowCount }"
      aria-hidden="true"
    >
      <NavBar />
      <div v-for="(row, r) in board.contentRows" :key="r" class="board-row">
        <BoardCell
          v-for="(cell, c) in row"
          :key="c"
          :cell="cell"
          :row="NAV_ROWS + r"
          :col="c"
        />
      </div>
      <div v-for="(row, r) in board.footerRows" :key="r" class="board-row board-row--footer">
        <BoardCell
          v-for="(cell, c) in row"
          :key="c"
          :cell="cell"
          :row="NAV_ROWS + board.contentRowCount + r"
          :col="c"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.board-viewport {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.board {
  /* A cell is half as wide as it is tall; the board fills the viewport
     without overflowing either axis and never repositions. */
  --cell-w: min(100vw / var(--cols), 100vh / var(--rows) / 2);
  --cell-h: calc(var(--cell-w) * 2);
  --cell-font-size: calc(var(--cell-w) * 1.45);
}

.board-row {
  display: flex;
  /* Scope layout/paint to the row so a flipping cell can't reflow siblings. */
  contain: layout paint style;
}
</style>
