<script setup lang="ts">
import { ref, watch, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { useBoardStore } from '@/stores/board'
import BoardCell from './BoardCell.vue'
import type { Line, LinkSpan } from '@/engine/types'

/**
 * Persistent nav bar occupying the board's fixed top rows (CLAUDE.md #5) —
 * a title row with page links, over a rule line, like a departure board
 * header. Rendered from the same cell model as everything else, so hover
 * changes flip like any other cells:
 *  - hovering a menu item paints just that item navy (the CTA treatment);
 *  - hovering the "POLYSITE" title fills it navy column-by-column, like a
 *    loading bar, over TITLE_DWELL_MS; it isn't a link (LinkSpan.href is
 *    omitted — paint without navigation, see engine/types.ts), it's a tease
 *    for the wordmark-cycling easter egg that starts the instant the bar
 *    finishes filling;
 *  - hovering anywhere over the nav flips the rule line's dashes into carets
 *    pointing up at the menu.
 * All revert (and flip back) when the pointer leaves.
 */

const NAV_ITEMS: Array<{ label: string; href: string }> = [
  { label: 'Home', href: '/' },
  { label: 'Projects', href: '/projects' },
  { label: 'Contact', href: '/contact' },
]

const TITLE_PHRASES = [
  'POLYSITE',
  'POLYGON',
  'LOWPOLY',
  'HIGHPOLY',
  'POLYMESH',
  'POLYSCAPE',
  'POLYHEDRON',
  'POLYTRON',
  'POLYGLOT',
]
/** Fixed field width so the menu never shifts as the phrase length changes. */
const TITLE_WIDTH = Math.max(...TITLE_PHRASES.map((p) => p.length))
/** How long hovering the title takes to fill the loading bar and trigger the
 *  wordmark-cycling easter egg; the bar advances one column every this/BASE
 *  phrase length ms. */
const TITLE_DWELL_MS = 1200
const TITLE_CYCLE_MS = 2200
/** The phrase shown (and used as the loading bar's length) before the egg
 *  has triggered — always index 0, since phraseIndex only advances afterward. */
const BASE_PHRASE = TITLE_PHRASES[0]!
const ITEM_GAP = 2
/** Inset the whole row one column from each edge so an edge item (the title,
 *  the last menu item) has room for a hover hyphen on its outer side too. */
const NAV_MARGIN = 1
const MENU_TEXT = NAV_ITEMS.map((i) => i.label).join(' '.repeat(ITEM_GAP))

/** Whether the title field fits alongside the menu at this column count —
 *  shared by the renderer and the hover hit-test so they never disagree. */
function titleShownFor(cols: number): boolean {
  return NAV_MARGIN + TITLE_WIDTH + 1 + MENU_TEXT.length + NAV_MARGIN <= cols
}

/** The nav item, if any, whose page the route is currently on — matches
 *  nested routes (`/projects/foo` under `/projects`) but not the root ('/')
 *  against everything. */
function activeHrefFor(path: string): string | null {
  const item = NAV_ITEMS.find((i) =>
    i.href === '/' ? path === '/' : path === i.href || path.startsWith(i.href + '/'),
  )
  return item?.href ?? null
}

/** href of the menu item currently under the pointer, if any (drives paint). */
const hoveredHref = ref<string | null>(null)
/** Column under the pointer while over the nav, else null (drives the caret). */
const hoveredCol = ref<number | null>(null)
/** True while the pointer is over the title block (drives its paint + cycle). */
const hoveredTitle = ref(false)
/** Index into TITLE_PHRASES; only advances while the title is dwelt on. */
const phraseIndex = ref(0)
/** Loading-bar fill, in columns from the left, while ramping up (0..BASE_PHRASE.length). */
const dwellStep = ref(0)
/** True once the bar has filled once this hover and the egg is live — the title
 *  then stays fully painted (matching whichever phrase is currently showing)
 *  instead of tracking dwellStep. */
const dwellComplete = ref(false)

function buildNavLines(
  cols: number,
  hovered: string | null,
  col: number | null,
  titleHovered: boolean,
  phrase: string,
  fillCols: number,
  activeHref: string | null,
): Line[] {
  const menu = MENU_TEXT
  // Title left, menu right, both inset by NAV_MARGIN; drop the title if narrow.
  const showTitle = titleShownFor(cols)
  const titleField = showTitle ? phrase.padEnd(TITLE_WIDTH) : ''
  const pad = cols - 2 * NAV_MARGIN - menu.length - titleField.length
  const text =
    ' '.repeat(NAV_MARGIN) +
    titleField +
    ' '.repeat(Math.max(1, pad)) +
    menu +
    ' '.repeat(NAV_MARGIN)

  const menuLinks: LinkSpan[] = []
  let cursor = text.length - NAV_MARGIN - menu.length
  for (const item of NAV_ITEMS) {
    // Clickable always; painted navy only while hovered.
    menuLinks.push({
      start: cursor,
      end: cursor + item.label.length,
      href: item.href,
      paint: item.href === hovered,
    })
    cursor += item.label.length + ITEM_GAP
  }

  // The title block, inset by NAV_MARGIN. It has no href (not a link — paint
  // without navigation, see engine/types.ts) and paints navy column-by-column
  // as fillCols ramps from 0 to the phrase length: the loading-bar tease for
  // the wordmark-cycling easter egg.
  const links: LinkSpan[] = [...menuLinks]
  const titleStart = NAV_MARGIN
  const titleEnd = titleStart + phrase.length
  if (showTitle) {
    links.unshift({ start: titleStart, end: titleStart + TITLE_WIDTH, paint: false })
    const paintEnd = titleStart + Math.min(fillCols, phrase.length)
    if (titleHovered && paintEnd > titleStart) {
      links.unshift({ start: titleStart, end: paintEnd, paint: true })
    }
  }

  const span = menuLinks.find((l) => l.href === hovered)
  const activeSpan = menuLinks.find((l) => l.href === activeHref)

  // Flank the hovered item with hyphens in the title row ("- Home -"), and the
  // title itself the same way while it's hovered ("-POLYSITE-"). The item for
  // whatever page is currently showing gets the same hyphens permanently, as
  // a "you are here" marker, independent of hover.
  const title = text.split('')
  if (activeSpan) {
    if (activeSpan.start - 1 >= 0) title[activeSpan.start - 1] = '-'
    if (activeSpan.end < cols) title[activeSpan.end] = '-'
  }
  if (span) {
    if (span.start - 1 >= 0) title[span.start - 1] = '-'
    if (span.end < cols) title[span.end] = '-'
  }
  if (showTitle && titleHovered) {
    if (titleStart - 1 >= 0) title[titleStart - 1] = '-'
    if (titleEnd < cols) title[titleEnd] = '-'
  }

  // Carets point up at what the pointer is over: the full width of the hovered
  // menu item or the hovered title, or — when the pointer is over the nav but
  // not an item — a single caret under the cursor. Everything else stays a dash.
  const rule = Array.from({ length: cols }, () => '-')
  if (span) {
    for (let c = span.start; c < Math.min(span.end, cols); c++) rule[c] = '^'
  } else if (showTitle && titleHovered) {
    for (let c = titleStart; c < Math.min(titleEnd, cols); c++) rule[c] = '^'
  } else if (col !== null && col >= 0 && col < cols) {
    rule[col] = '^'
  }

  return [
    { text: title.join(''), kind: 'heading', links },
    { text: rule.join(''), kind: 'body', links: [] },
  ]
}

const board = useBoardStore()
const route = useRoute()

// Rebuild the nav on mount, when the column count changes (the board crossed
// the mobile breakpoint), when the route changes (the active-page hyphen),
// and whenever the hover/phrase/dwell state changes. setNav diffs, so only
// the cells that actually change (the hovered item, the caret, the
// loading-bar's advancing edge, the active marker) flip.
watch(
  [
    () => board.cols,
    () => route.path,
    hoveredHref,
    hoveredCol,
    hoveredTitle,
    phraseIndex,
    dwellStep,
    dwellComplete,
  ],
  ([cols, path]) => {
    const phrase = TITLE_PHRASES[phraseIndex.value] ?? BASE_PHRASE
    const fillCols = dwellComplete.value ? phrase.length : dwellStep.value
    board.setNav(
      buildNavLines(
        cols as number,
        hoveredHref.value,
        hoveredCol.value,
        hoveredTitle.value,
        phrase,
        fillCols,
        activeHrefFor(path as string),
      ),
    )
  },
  { immediate: true },
)

// Title dwell → loading bar → phrase cycle. Hovering starts the bar filling
// one column every TITLE_DWELL_MS/BASE_PHRASE.length; reaching the end starts
// the wordmark cycle (the easter egg) and holds the title fully painted for
// as long as it's cycling. Leaving clears everything and snaps back to the
// first phrase (POLYSITE), which then flips back on the next diff.
const DWELL_STEP_MS = TITLE_DWELL_MS / BASE_PHRASE.length
let dwellTimer: ReturnType<typeof setInterval> | undefined
let cycleTimer: ReturnType<typeof setInterval> | undefined
function stopCycle() {
  if (dwellTimer) clearInterval(dwellTimer)
  if (cycleTimer) clearInterval(cycleTimer)
  dwellTimer = cycleTimer = undefined
}
watch(hoveredTitle, (on) => {
  stopCycle()
  if (on) {
    dwellStep.value = 0
    dwellComplete.value = false
    dwellTimer = setInterval(() => {
      dwellStep.value++
      if (dwellStep.value >= BASE_PHRASE.length) {
        clearInterval(dwellTimer)
        dwellTimer = undefined
        dwellComplete.value = true
        cycleTimer = setInterval(() => {
          phraseIndex.value = (phraseIndex.value + 1) % TITLE_PHRASES.length
        }, TITLE_CYCLE_MS)
      }
    }, DWELL_STEP_MS)
  } else {
    dwellStep.value = 0
    dwellComplete.value = false
    phraseIndex.value = 0
  }
})
onBeforeUnmount(stopCycle)

// Hover is a post-load affordance; during the loading intro the nav is held
// behind the noise, so don't retarget it (which would reveal a caret rule).
function onMove(event: PointerEvent) {
  if (board.loading) return
  const cell = (event.target as HTMLElement | null)?.closest('.cell') as HTMLElement | null
  if (!cell) {
    hoveredHref.value = null
    hoveredCol.value = null
    hoveredTitle.value = false
    return
  }
  const colStr = cell.dataset.col
  const col = colStr === undefined ? null : Number(colStr)
  const href = cell.dataset.href ?? null
  // The title has no href, so it's identified purely by column position
  // (it always occupies the left inset columns when shown).
  if (col !== null && col < NAV_MARGIN + TITLE_WIDTH && titleShownFor(board.cols)) {
    hoveredTitle.value = true
    hoveredHref.value = null
    hoveredCol.value = null
    return
  }
  hoveredTitle.value = false
  hoveredHref.value = href
  hoveredCol.value = col
}
function onLeave() {
  hoveredHref.value = null
  hoveredCol.value = null
  hoveredTitle.value = false
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
