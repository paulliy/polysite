<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Board from '@/components/Board.vue'
import { useBoardStore } from '@/stores/board'
import { contentForPath } from '@/content/loader'
import { paginateMarkdown } from '@/engine/paginate'
import { useScrollPosition } from '@/composables/useScrollPosition'
import { whenLoadingComplete } from '@/composables/useLoadingIntro'
import { primeClack, whenAudioReady } from '@/audio/clack'
import { LOADING_REVEAL_MAX_WAIT_MS } from '@/config'

/**
 * The Board lives here, outside <RouterView>, so route changes only retarget
 * its content and never unmount it (CLAUDE.md #4). This component is the
 * glue: route path → markdown → frames → board store; input → frame steps.
 */

const board = useBoardStore()
const route = useRoute()

// Arm the audio unlock now so a gesture during the loading intro leaves the
// context running in time for the reveal's clacks (browser autoplay policy).
primeClack()

// Content is bundled markdown, so the first frame is ready synchronously — but
// the loading noise still runs for its full minimum duration before revealing
// it (CLAUDE.md #9). `contentReady` resolves once the first page is committed.
let markContentReady!: () => void
const contentReady = new Promise<void>((resolve) => {
  markContentReady = resolve
})

watch(
  () => route.path,
  (path) => {
    board.setPage(
      paginateMarkdown(contentForPath(path), {
        cols: board.cols,
        rows: board.contentRowCount,
      }),
    )
    markContentReady()
  },
  { immediate: true },
)

// Reveal once the noise has run its minimum, content is ready, AND audio is
// unlocked (the first gesture) so the reveal's clack cascade is heard — or
// after the max-wait fallback, whichever comes first.
Promise.all([
  whenLoadingComplete(contentReady),
  whenAudioReady(LOADING_REVEAL_MAX_WAIT_MS),
]).then(() => {
  board.finishLoading()
})

useScrollPosition({ onStep: (delta) => board.advance(delta) })
</script>

<template>
  <Board />
  <RouterView />
</template>
