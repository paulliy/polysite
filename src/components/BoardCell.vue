<script setup lang="ts">
import { computed, ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useBoardStore, type BoardCellState } from '@/stores/board'
import {
  FLIP_HOP_MS,
  FLIP_EASING,
  DEFER_FLIP_MOUNT,
  LOADING_HOP_MS,
  LOADING_GAP_MIN_MS,
  LOADING_GAP_MAX_MS,
  LOADING_START_STAGGER_MS,
  RIPPLE_DURATION_MS,
  RIPPLE_CURVE,
} from '@/config'
import { randomLoadingFace } from '@/engine/characterSet'
import { rippleDelayMs } from '@/engine/ripple'

const props = defineProps<{ cell: BoardCellState; row: number; col: number }>()

const board = useBoardStore()
const router = useRouter()

/** The in-flight targeted flip for this cell, if any. */
const flip = computed(() => board.flips.get(`${props.row}:${props.col}`))

/**
 * The heavy `.flip` subtree (the 3D animator) is mounted only while this cell
 * is actively animating — loading noise, the intro settle, or a targeted flip.
 * Idle cells render a single static face, keeping the ~968-cell resting board
 * cheap. All animation is driven imperatively via the Web Animations API on the
 * one stable `.flip` element: each hop swaps the two faces' text and restarts
 * the 180° rotation, rather than recreating DOM per hop.
 */
const flipEl = ref<HTMLElement | null>(null)
const frontEl = ref<HTMLElement | null>(null)
const backEl = ref<HTMLElement | null>(null)

const showFlip = ref(false)
/** A targeted flip that hasn't reached its ripple turn yet: hold the OLD face. */
const waiting = ref(false)

let animation: Animation | null = null
let timer: ReturnType<typeof setTimeout> | undefined

const rand = () => Math.random()

function clearTimer() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

function stop() {
  clearTimer()
  animation?.cancel()
  animation = null
}

function faceClasses(cell: BoardCellState) {
  return { 'face--link': cell.href !== null, 'face--heading': cell.heading }
}

/** Only the real endpoint faces carry paint; intermediate flaps are plain. */
function faceClassName(base: string, cell: BoardCellState, painted: boolean): string {
  let className = base
  if (painted && cell.href !== null) className += ' face--link'
  if (painted && cell.heading) className += ' face--heading'
  return className
}

/** One 180° rotation of the `.flip` element. */
function rotate(duration: number, delay = 0): Animation | null {
  const el = flipEl.value
  if (!el) return null
  return el.animate(
    [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-180deg)' }],
    { duration, easing: FLIP_EASING, delay, fill: 'forwards' },
  )
}

// --- Loading noise: intermittent, unsynchronized per-cell flapping ---------

function noiseHop() {
  const front = frontEl.value
  const back = backEl.value
  if (!front || !back) return
  const next = randomLoadingFace(front.textContent ?? undefined)
  back.textContent = next
  back.className = 'face face--back'
  animation?.cancel()
  animation = rotate(LOADING_HOP_MS)
  if (!animation) return
  animation.onfinish = () => {
    // Carry the landed face onto the front and snap the parent back to 0°
    // (seamless — same glyph faces the viewer), then wait a random gap before
    // the next hop so the board reads as organic texture, not a pulse.
    front.textContent = next
    front.className = 'face face--front'
    animation?.cancel()
    if (!board.loading) return
    timer = setTimeout(noiseHop, LOADING_GAP_MIN_MS + rand() * (LOADING_GAP_MAX_MS - LOADING_GAP_MIN_MS))
  }
}

function startNoise() {
  stop()
  waiting.value = false
  showFlip.value = true
  void nextTick(() => {
    const front = frontEl.value
    if (!front) return
    front.textContent = randomLoadingFace()
    front.className = 'face face--front'
    // Random initial stagger so cells don't begin in unison.
    timer = setTimeout(noiseHop, rand() * LOADING_START_STAGGER_MS)
  })
}

/** Intro complete: flip from the current noise face to the real face, on the
 *  top-to-bottom ripple, then drop to a static face. */
function settle() {
  clearTimer()
  const front = frontEl.value
  const back = backEl.value
  if (!flipEl.value || !front || !back) {
    showFlip.value = false
    return
  }
  animation?.cancel() // snap to 0°: front holds the current noise face
  animation = null
  back.textContent = props.cell.face
  back.className = faceClassName('face face--back', props.cell, true)
  const rowFraction = board.rowCount > 1 ? props.row / (board.rowCount - 1) : 0
  animation = rotate(FLIP_HOP_MS, rippleDelayMs(rowFraction, RIPPLE_DURATION_MS, RIPPLE_CURVE))
  if (!animation) {
    showFlip.value = false
    return
  }
  animation.onfinish = () => {
    showFlip.value = false
  }
}

// --- Targeted flip: post-load navigation / scroll --------------------------

function startFlip() {
  const f = flip.value
  const front = frontEl.value
  const back = backEl.value
  if (!f || !flipEl.value || !front || !back) return

  const faces = f.faces
  const lastHop = faces.length - 2
  let hop = 0

  const runHop = () => {
    front.textContent = faces[hop] ?? props.cell.face
    front.className = faceClassName('face face--front', f.from, hop === 0)
    animation?.cancel()

    back.textContent = faces[hop + 1] ?? props.cell.face
    back.className = faceClassName('face face--back', props.cell, hop === lastHop)

    // With DEFER_FLIP_MOUNT the arm timer already consumed the ripple delay,
    // so every hop runs immediately; otherwise the first hop carries it.
    const delay = hop === 0 && !DEFER_FLIP_MOUNT ? f.delayMs : 0
    animation = rotate(FLIP_HOP_MS, delay)
    if (!animation) return
    animation.onfinish = () => {
      if (hop < lastHop) {
        hop++
        runHop()
      } else {
        board.completeFlip(props.row, props.col)
      }
    }
  }

  runHop()
}

function armFlip() {
  waiting.value = false
  showFlip.value = true
  void nextTick(startFlip)
}

onMounted(() => {
  if (board.loading) startNoise()
})

// Intro reveal: noise → settled content on the ripple wave.
watch(
  () => board.loading,
  (isLoading, was) => {
    if (was && !isLoading) settle()
  },
)

// Targeted flips (suppressed by the store while loading, so this is inert then).
watch(
  () => flip.value?.serial,
  (serial) => {
    if (board.loading) return
    stop()
    if (serial === undefined) {
      showFlip.value = false
      waiting.value = false
      return
    }
    const delay = flip.value?.delayMs ?? 0
    if (DEFER_FLIP_MOUNT && delay > 0) {
      // Hold the old face until this cell's ripple turn, then flip.
      waiting.value = true
      showFlip.value = false
      timer = setTimeout(armFlip, delay)
    } else {
      armFlip()
    }
  },
  { immediate: true },
)

onBeforeUnmount(stop)

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
    <span v-if="showFlip" ref="flipEl" class="flip">
      <span ref="frontEl" class="face face--front"></span>
      <span ref="backEl" class="face face--back"></span>
    </span>
    <!-- Targeted flip waiting for its ripple turn: hold the OLD face so the
         target isn't revealed early (the cell's own `face` is already it). -->
    <span
      v-else-if="waiting && flip"
      class="face"
      :class="faceClasses(flip.from)"
      >{{ flip.from.face }}</span
    >
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
  /* Fixed-size, self-contained cell: scope style/layout/paint recalc so a
     flip (subtree swap + 3D transform) can't invalidate the other ~968 cells. */
  contain: strict;
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

/* One 180° hop per flap, driven per hop by the Web Animations API (see the
   component script) — a flip chains a few hops through random faces. */
.flip {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
  /* Only actively-flipping cells mount `.flip`, so this compositor hint never
     applies to the idle board — only to cells currently animating. */
  will-change: transform;
}

.flip .face {
  position: absolute;
  inset: 0;
  backface-visibility: hidden;
}

.face--back {
  transform: rotateX(180deg);
}
</style>
