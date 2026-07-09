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
  LOADING_MAX_CONCURRENT,
  LOADING_GAP_JITTER,
  RIPPLE_DURATION_MS,
  RIPPLE_CURVE,
} from '@/config'
import { isIcon, randomLoadingFace } from '@/engine/characterSet'
import { iconSvg } from '@/engine/icons'
import { tileBackgroundStyle } from '@/engine/imageTile'
import { rippleDelayMs } from '@/engine/ripple'
import IconGlyph from './IconGlyph.vue'

const props = defineProps<{ cell: BoardCellState; row: number; col: number }>()

const board = useBoardStore()
const router = useRouter()

/** The in-flight targeted flip for this cell, if any. */
const flip = computed(() => board.flips.get(`${props.row}:${props.col}`))

/** If this cell is part of the centered loading prompt, the face it holds. */
const messageFace = computed(() => board.loadingMessage.get(`${props.row}:${props.col}`))

/**
 * `.flip` (the 3D animator) is mounted through the loading intro and during a
 * targeted flip, but NOT for idle cells. Every hop is driven purely
 * imperatively — WAAPI + textContent, no per-hop Vue reactivity — so the
 * loading noise doesn't churn the patcher across ~1500 cells. `will-change` is
 * deliberately omitted (see CSS): idle mounted `.flip`s then hold no compositor
 * layer, and only the bounded set of actively-animating cells is promoted.
 *
 * A generation counter invalidates async callbacks (nextTick / timer /
 * onfinish) left over from a previous phase, so loading → reveal → targeted
 * flips can't race.
 */
const flipEl = ref<HTMLElement | null>(null)
const frontEl = ref<HTMLElement | null>(null)
const backEl = ref<HTMLElement | null>(null)

// Start mounted iff the board is animating its loading intro (folds `.flip`
// into the first render instead of a second patch), then unmount once settled.
// With reduced motion nothing animates, so it starts unmounted (static face).
const showFlip = ref(board.loading && !board.reducedMotion)
/** A targeted flip awaiting its ripple turn: hold the OLD face. */
const waiting = ref(false)

let animation: Animation | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let gen = 0

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
  return {
    'face--link': cell.link,
    'face--heading': cell.heading,
    'face--bold': cell.bold,
    'face--italic': cell.italic,
  }
}

/** Inline style for an image cell (CLAUDE.md rule 6's one exception): a color
 *  pair for quadrant cells, or a CSS background-image slice for tile cells, or
 *  undefined so an ordinary cell keeps the default off-white-on-black palette.
 *  Color and tile are independent channels, merged if both are ever set. */
function faceStyle(cell: BoardCellState) {
  const color = cell.color ? { color: cell.color.fg, background: cell.color.bg } : null
  const tile = cell.tile ? tileBackgroundStyle(cell.tile) : null
  return color || tile ? { ...color, ...tile } : undefined
}

/** Paint a flip face's color imperatively (mirrors faceStyle for the WAAPI hops,
 *  which set content/class directly rather than through Vue). */
function applyColor(el: HTMLElement, color: BoardCellState['color']) {
  el.style.color = color ? color.fg : ''
  el.style.background = color ? color.bg : ''
}

/** Paint a flip face's image-tile slice imperatively (the tile counterpart to
 *  applyColor), or clear it so an intermediate/non-image face is plain. */
function applyTile(el: HTMLElement, tile: BoardCellState['tile']) {
  if (tile) {
    const style = tileBackgroundStyle(tile)
    el.style.backgroundImage = style.backgroundImage
    el.style.backgroundSize = style.backgroundSize
    el.style.backgroundPosition = style.backgroundPosition
  } else {
    el.style.backgroundImage = ''
    el.style.backgroundSize = ''
    el.style.backgroundPosition = ''
  }
}

/** Only the real endpoint faces carry paint; intermediate flaps are plain. */
function faceClassName(base: string, cell: BoardCellState, painted: boolean): string {
  let className = base
  if (painted && cell.link) className += ' face--link'
  if (painted && cell.heading) className += ' face--heading'
  if (painted && cell.bold) className += ' face--bold'
  if (painted && cell.italic) className += ' face--italic'
  return className
}

/** Set a flip face's content — inline SVG for icon faces, text otherwise.
 *  Handles switching either way as an element is reused across hops. */
function setFaceContent(el: HTMLElement, face: string) {
  const svg = iconSvg(face)
  if (svg) el.innerHTML = svg
  else el.textContent = face
}

/** One 180° rotation of the `.flip` element. */
function rotate(duration: number): Animation | null {
  const el = flipEl.value
  if (!el) return null
  return el.animate(
    [{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-180deg)' }],
    { duration, easing: FLIP_EASING, fill: 'forwards' },
  )
}

// --- Loading noise: bounded-concurrency, unsynchronized flapping -----------

/** Gap tuned so ~LOADING_MAX_CONCURRENT cells are mid-hop at once, any grid.
 *  The concurrency target scales down on weaker device tiers (fewer cells
 *  animating at once → a larger gap); hop/floor/jitter are untouched, so the
 *  noise keeps its exact organic character, just throttled. */
function noiseGap(): number {
  const total = board.rowCount * board.cols
  const concurrency = LOADING_MAX_CONCURRENT * board.timingScale.loadingConcurrency
  const base = Math.max(LOADING_GAP_MIN_MS, LOADING_HOP_MS * (total / concurrency - 1))
  return base * (1 - LOADING_GAP_JITTER / 2 + rand() * LOADING_GAP_JITTER)
}

function noiseHop(g: number) {
  if (g !== gen || !board.loading) return
  const front = frontEl.value
  const back = backEl.value
  if (!front || !back || !flipEl.value) return
  const current = front.textContent || randomLoadingFace()
  const next = randomLoadingFace(current)
  back.textContent = next
  back.className = 'face face--back'
  animation?.cancel()
  animation = rotate(LOADING_HOP_MS)
  if (!animation) return
  animation.onfinish = () => {
    if (g !== gen) return
    // Carry the landed face onto the front and snap back to 0° (seamless),
    // then wait a random gap — the cell rests on a static glyph between hops.
    front.textContent = next
    animation?.cancel()
    animation = null
    if (board.loading) timer = setTimeout(() => noiseHop(g), noiseGap())
  }
}

function startNoise() {
  const g = ++gen
  waiting.value = false
  showFlip.value = true
  void nextTick(() => {
    if (g !== gen) return
    const front = frontEl.value
    if (!front) return
    front.textContent = randomLoadingFace()
    front.className = 'face face--front'
    // Spread first hops across a gap so they don't fire on one frame.
    timer = setTimeout(() => noiseHop(g), rand() * noiseGap())
  })
}

/** A loading-prompt cell rests on its assigned face (static) amid the noise so
 *  the message stays legible; it flips to real content on the reveal (settle).
 *  Painted with the link/CTA treatment (navy behind off-white) so the whole
 *  strip reads as a "click to start" button. */
function showLoadingMessage() {
  const g = ++gen
  waiting.value = false
  showFlip.value = true
  void nextTick(() => {
    if (g !== gen) return
    const front = frontEl.value
    if (!front) return
    front.textContent = messageFace.value ?? ''
    front.className = 'face face--front face--link'
  })
}

/** Intro complete: at this cell's ripple turn, flip the resting noise glyph to
 *  the real face, then unmount `.flip` and show the static settled face. */
function settle() {
  const g = ++gen
  clearTimer()
  animation?.cancel()
  animation = null
  const rowFraction = board.rowCount > 1 ? props.row / (board.rowCount - 1) : 0
  timer = setTimeout(
    () => {
      if (g !== gen) return
      const front = frontEl.value
      const back = backEl.value
      if (!flipEl.value || !front || !back) {
        showFlip.value = false
        return
      }
      setFaceContent(back, props.cell.face)
      back.className = faceClassName('face face--back', props.cell, true)
      applyColor(back, props.cell.color)
      applyTile(back, props.cell.tile)
      animation?.cancel()
      animation = rotate(FLIP_HOP_MS)
      if (!animation) {
        showFlip.value = false
        return
      }
      animation.onfinish = () => {
        if (g !== gen) return
        animation?.cancel()
        animation = null
        showFlip.value = false // → static settled face
      }
    },
    // Same tier-scaled sweep the store uses for the reveal clack schedule.
    rippleDelayMs(rowFraction, RIPPLE_DURATION_MS * board.timingScale.rippleDuration, RIPPLE_CURVE),
  )
}

// --- Targeted flip: post-load navigation / scroll --------------------------

function startFlip(g: number) {
  const f = flip.value
  if (!f) return
  const faces = f.faces
  const lastHop = faces.length - 2
  showFlip.value = true
  void nextTick(() => {
    if (g !== gen) return
    const front = frontEl.value
    const back = backEl.value
    if (!flipEl.value || !front || !back) return
    let step = 0
    const runHop = () => {
      if (g !== gen) return
      setFaceContent(front, faces[step] ?? props.cell.face)
      front.className = faceClassName('face face--front', f.from, step === 0)
      // Only the real endpoints carry color/tile; intermediate flaps are plain.
      applyColor(front, step === 0 ? f.from.color : null)
      applyTile(front, step === 0 ? f.from.tile : null)
      animation?.cancel()
      setFaceContent(back, faces[step + 1] ?? props.cell.face)
      back.className = faceClassName('face face--back', props.cell, step === lastHop)
      applyColor(back, step === lastHop ? props.cell.color : null)
      applyTile(back, step === lastHop ? props.cell.tile : null)
      animation = rotate(FLIP_HOP_MS)
      if (!animation) return
      animation.onfinish = () => {
        if (g !== gen) return
        if (step < lastHop) {
          step++
          runHop()
        } else {
          showFlip.value = false
          board.completeFlip(props.row, props.col)
        }
      }
    }
    runHop()
  })
}

onMounted(() => {
  if (board.loading && !board.reducedMotion) {
    if (messageFace.value !== undefined) showLoadingMessage()
    else startNoise()
  }
})

// Intro reveal: noise → settled content on the ripple wave (skipped when the
// visitor prefers reduced motion — the content is already shown statically).
watch(
  () => board.loading,
  (isLoading, was) => {
    if (was && !isLoading && !board.reducedMotion) settle()
  },
)

// Targeted flips (suppressed by the store while loading or reduced-motion).
watch(
  () => flip.value?.serial,
  (serial) => {
    if (board.loading || board.reducedMotion) return
    const g = ++gen
    clearTimer()
    animation?.cancel()
    animation = null
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
      timer = setTimeout(() => {
        if (g !== gen) return
        waiting.value = false
        startFlip(g)
      }, delay)
    } else {
      startFlip(g)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  gen++
  stop()
})

function follow() {
  // During the loading intro a click just starts the reveal — never navigates.
  if (board.loading) return
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
  <span class="cell" :data-href="cell.href ?? undefined" :data-col="col" @click="follow">
    <span v-if="showFlip" ref="flipEl" class="flip">
      <span ref="frontEl" class="face face--front"></span>
      <span ref="backEl" class="face face--back"></span>
    </span>
    <!-- Targeted flip awaiting its ripple turn: hold the OLD face. -->
    <span
      v-else-if="waiting && flip"
      class="face"
      :class="faceClasses(flip.from)"
      :style="faceStyle(flip.from)"
    >
      <IconGlyph v-if="isIcon(flip.from.face)" :char="flip.from.face" />
      <template v-else>{{ flip.from.face }}</template>
    </span>
    <span v-else class="face" :class="faceClasses(cell)" :style="faceStyle(cell)">
      <IconGlyph v-if="isIcon(cell.face)" :char="cell.face" />
      <template v-else>{{ cell.face }}</template>
    </span>
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
     flip (subtree swap + 3D transform) can't invalidate the other cells. */
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
  /* Tile-slice image cells set background-image/-size/-position inline; this
     keeps a slice from tiling. Inert for ordinary cells (no background-image). */
  background-repeat: no-repeat;
}

.face--heading {
  font-weight: var(--font-weight-heading);
}

.face--bold {
  font-weight: var(--font-weight-bold);
}

.face--italic {
  font-style: italic;
}

.face--link {
  background: var(--color-link-bg);
  color: var(--color-link-char);
}

/* One 180° hop per flap, driven per hop by the Web Animations API (see the
   component script). No `will-change`: WAAPI auto-composites the actively
   animating cells, while idle mounted `.flip`s (e.g. every cell during the
   loading intro) hold no permanent layer — key to scaling to a dense grid. */
.flip {
  position: absolute;
  inset: 0;
  transform-style: preserve-3d;
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
