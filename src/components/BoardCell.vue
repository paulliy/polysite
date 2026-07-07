<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBoardStore, type BoardCellState } from '@/stores/board'
import { FLIP_HOP_MS, FLIP_INTERMEDIATE_MIN, FLIP_INTERMEDIATE_MAX } from '@/config'
import { randomSpinFace } from '@/engine/characterSet'

const props = defineProps<{ cell: BoardCellState; row: number; col: number }>()

const board = useBoardStore()
const router = useRouter()

/** The in-flight flip for this cell, if any. */
const flip = computed(() => board.flips.get(`${props.row}:${props.col}`))

/**
 * A flip is a short sequence of flap hops: old face → a few random
 * intermediate faces → target face. Each hop is one 180° rotation; the CSS
 * animation is restarted per hop via the :key below.
 */
const faces = ref<string[]>([])
const hop = ref(0)

watch(
  () => flip.value?.serial,
  () => {
    if (!flip.value) {
      faces.value = []
      hop.value = 0
      return
    }
    const spins =
      FLIP_INTERMEDIATE_MIN +
      Math.floor(Math.random() * (FLIP_INTERMEDIATE_MAX - FLIP_INTERMEDIATE_MIN + 1))
    const sequence = [flip.value.from.face]
    for (let i = 0; i < spins; i++) sequence.push(randomSpinFace())
    sequence.push(props.cell.face)
    faces.value = sequence
    hop.value = 0
  },
  { immediate: true },
)

const lastHop = computed(() => hop.value >= faces.value.length - 2)
const frontFace = computed(() => faces.value[hop.value] ?? props.cell.face)
const backFace = computed(() => (lastHop.value ? props.cell.face : faces.value[hop.value + 1]))

const hopStyle = computed(() => ({
  animationDelay: `${hop.value === 0 ? (flip.value?.delayMs ?? 0) : 0}ms`,
  animationDuration: `${FLIP_HOP_MS}ms`,
}))

function faceClasses(cell: BoardCellState) {
  return { 'face--link': cell.href !== null, 'face--heading': cell.heading }
}

/** Intermediate flaps are plain — paint only exists on the real faces. */
const frontClasses = computed(() =>
  hop.value === 0 && flip.value ? faceClasses(flip.value.from) : {},
)
const backClasses = computed(() => (lastHop.value ? faceClasses(props.cell) : {}))

function onHopEnd() {
  if (hop.value < faces.value.length - 2) {
    hop.value++
  } else {
    board.completeFlip(props.row, props.col)
  }
}

function follow() {
  const href = props.cell.href
  if (!href) return
  if (href.startsWith('/')) {
    router.push(href)
  } else {
    // mailto: and external links leave the board.
    window.open(href, href.startsWith('mailto:') ? '_self' : '_blank', 'noopener')
  }
}
</script>

<template>
  <span class="cell" :data-href="cell.href ?? undefined" @click="follow">
    <span
      v-if="flip"
      :key="`${flip.serial}:${hop}`"
      class="flip"
      :style="hopStyle"
      @animationend="onHopEnd"
    >
      <span class="face face--front" :class="frontClasses">{{ frontFace }}</span>
      <span class="face face--back" :class="backClasses">{{ backFace }}</span>
    </span>
    <span v-else class="face" :class="faceClasses(cell)">{{ cell.face }}</span>
  </span>
</template>

<style scoped>
.cell {
  position: relative;
  width: var(--cell-w);
  height: var(--cell-h);
  overflow: hidden;
  /* Depth for the 3D flip; flat design otherwise (no shadows/bevels). */
  perspective: calc(var(--cell-h) * 6);
  user-select: none;
}

.cell[data-href] {
  cursor: pointer;
}

.face {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: var(--cell-font-size);
  line-height: 1;
  color: var(--color-char);
}

.face--heading {
  font-weight: var(--font-weight-heading);
}

.face--link {
  background: var(--color-link-bg);
  color: var(--color-link-char);
}

/* One 180° hop per flap; a flip chains a few hops through random faces. */
.flip {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  animation-name: cell-flip;
  animation-timing-function: cubic-bezier(0.35, 0, 0.65, 1);
  animation-fill-mode: both;
}

.flip .face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}

.face--back {
  transform: rotateX(180deg);
}

@keyframes cell-flip {
  from {
    transform: rotateX(0);
  }
  to {
    transform: rotateX(-180deg);
  }
}
</style>
