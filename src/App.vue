<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Board from '@/components/Board.vue'
import HiddenContent from '@/components/HiddenContent.vue'
import { useBoardStore } from '@/stores/board'
import { contentForPath } from '@/content/loader'
import { imageLines, preloadContentImages } from '@/content/imageLoader'
import { paginateMarkdown } from '@/engine/paginate'
import { useScrollPosition } from '@/composables/useScrollPosition'
import { useReducedMotion } from '@/composables/useReducedMotion'
import { useGridDimensions } from '@/composables/useGridDimensions'
import { whenLoadingComplete } from '@/composables/useLoadingIntro'
import { primeClack, whenAudioReady } from '@/audio/clack'
import { LOADING_REVEAL_MAX_WAIT_MS } from '@/config'

/**
 * The Board lives here, outside <RouterView>, so route changes only retarget
 * its content and never unmount it (CLAUDE.md #4). This component is the glue:
 * route path → markdown → frames → board store; input → frame steps. The
 * visually-hidden HiddenContent is the accessible parallel copy (CLAUDE.md #11).
 */

const board = useBoardStore()
const route = useRoute()

// Reflect the reduced-motion preference into the store *before* the first
// commit so the initial page is applied without flips when it's set.
const reduced = useReducedMotion()
board.reducedMotion = reduced.value
watch(reduced, (value) => {
  board.reducedMotion = value
})

// Size the board to the viewport before the first paginate, and re-paginate
// when it crosses the mobile breakpoint.
const grid = useGridDimensions()
board.setGrid(grid.value.cols, grid.value.rows)

function renderCurrentPage() {
  board.setPage(
    paginateMarkdown(contentForPath(route.path), {
      cols: board.cols,
      rows: board.contentRowCount,
      image: (src) => imageLines(src, board.cols, board.contentRowCount),
    }),
  )
}

// Pixelate content images for the current grid size, then re-flow so they
// appear (they render to nothing until their character lines are cached).
function loadImagesThenRender() {
  void preloadContentImages(board.cols, board.contentRowCount).then(renderCurrentPage)
}

// Content is bundled markdown, so the first frame is ready synchronously.
// `contentReady` resolves once the first page is committed.
let markContentReady!: () => void
const contentReady = new Promise<void>((resolve) => {
  markContentReady = resolve
})

watch(
  () => route.path,
  () => {
    renderCurrentPage()
    markContentReady()
  },
  { immediate: true },
)

// Re-flow the current page (and re-pixelate images) when the viewport crosses
// the mobile breakpoint.
watch(grid, (dimensions) => {
  board.setGrid(dimensions.cols, dimensions.rows)
  renderCurrentPage()
  loadImagesThenRender()
})

loadImagesThenRender()

if (reduced.value) {
  // Reduced motion: no noise intro — content is shown directly (CLAUDE.md #11).
  board.finishLoading()
} else {
  // Arm the audio unlock now so a gesture during the loading intro leaves the
  // context running in time for the reveal's clacks (browser autoplay policy).
  primeClack()

  // Reveal once the noise has run its minimum, content is ready, AND audio is
  // unlocked (the first gesture) so the reveal's clack cascade is heard — or
  // after the max-wait fallback, whichever comes first.
  Promise.all([
    whenLoadingComplete(contentReady),
    whenAudioReady(LOADING_REVEAL_MAX_WAIT_MS),
  ]).then(() => {
    board.finishLoading()
  })
}

useScrollPosition({ onStep: (delta) => board.advance(delta) })
</script>

<template>
  <Board />
  <HiddenContent />
  <RouterView />
</template>
