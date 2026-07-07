<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import Board from '@/components/Board.vue'
import { useBoardStore } from '@/stores/board'
import { contentForPath } from '@/content/loader'
import { paginateMarkdown } from '@/engine/paginate'
import { useScrollPosition } from '@/composables/useScrollPosition'

/**
 * The Board lives here, outside <RouterView>, so route changes only retarget
 * its content and never unmount it (CLAUDE.md #4). This component is the
 * glue: route path → markdown → frames → board store; input → frame steps.
 */

const board = useBoardStore()
const route = useRoute()

watch(
  () => route.path,
  (path) => {
    board.setPage(
      paginateMarkdown(contentForPath(path), {
        cols: board.cols,
        rows: board.contentRowCount,
      }),
    )
  },
  { immediate: true },
)

useScrollPosition({ onStep: (delta) => board.advance(delta) })
</script>

<template>
  <Board />
  <RouterView />
</template>
