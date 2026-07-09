# CLAUDE.md

This file gives Claude Code persistent context for this project. Full rationale and
design decisions live in `docs/split-flap-site-brief.md` — read that first if
anything here is unclear or you need the "why" behind a rule. Note the brief
describes the original design; where it and this file disagree (e.g. the flip
rule below), this file and the code are current.

## What this is

A personal portfolio + product showcase site rendered entirely as a fixed grid of
split-flap (Solari board) characters. There's no native scrolling — the whole board
persists on screen and flips characters to show different content as the user
scrolls, swipes, or navigates between pages.

## Stack

- Vue 3 + `<script setup lang="ts">` + Vite
- Vue Router (real per-page URLs)
- Pinia (setup-store style, not options-store)
- VueUse for input/resize/reduced-motion composables
- CSS 3D transforms driven via the Web Animations API (`el.animate()`) for the flip
  animation — no animation library. WAAPI is used instead of stylesheet
  transitions/`@keyframes` because each cell needs a variable-length chain of
  random intermediate hops with a callback between hops; it's the same
  compositor-only `transform` animation, just with JS-level sequencing control.
- Device-class scaling (`engine/deviceClass.ts` + `composables/useDeviceClass.ts`):
  a `full`/`medium`/`low` tier is detected once at startup and scales — never
  changes the character of — the loading-noise concurrency and the ripple/flip
  timing (`board.timingScale`, wired in `stores/board.ts` and `BoardCell.vue`).
  `full` reproduces the base `config.ts` constants exactly. **`navigator.deviceMemory`
  is Chromium/Android-only** (absent on Firefox and every iOS browser, since
  Chrome-on-iOS is WebKit) — it must stay an *optional* signal in `classifyDevice`,
  never a required one; `hardwareConcurrency` and `matchMedia('(pointer: coarse)')`
  are the universal fallbacks. Playwright device emulation does **not** spoof these
  capability signals, so tier coverage in e2e goes through `forceDeviceClass()`
  (`e2e/helpers.ts`), not the mobile projects' device profiles.
- Markdown content, parsed at build time
- Vitest (unit) + Playwright (e2e)
- Bun as package manager and script runner
- ESLint (flat config) + Prettier

## Commands

```
bun install                    # install deps
bun run dev                    # local dev server (vite)
bun run build                  # type-check (vue-tsc --build) + production build
bun run preview                # preview the production build
bun run test:unit               # vitest, watch mode
bun run test:unit run           # vitest, single run
bun run test:unit run <pattern>  # run tests matching a filename/pattern
bun run test:e2e                 # playwright, all projects (chromium/firefox/webkit/Mobile Chrome/Mobile Safari)
bun run test:e2e <file>            # e.g. bun run test:e2e e2e/flip.spec.ts
bun run test:e2e --project=chromium  # single browser project
bun run lint                       # eslint . --fix --cache
bun run format                       # prettier --write src/ (experimental CLI)
```

`bunx playwright install` once before the first e2e run. Playwright's `webServer`
starts `bun run dev` (port 5173) automatically unless `CI` is set, in which case it
builds and uses `bun run preview` (port 4173) — you normally don't need to start a
dev server by hand before running e2e tests.

## Deployment

Hosted on **Cloudflare Workers static assets** (assets-only Worker, free tier)
at **https://poilygon.dev** (+ `www`, both wired as Workers custom domains —
DNS/certs are managed by the Worker's `routes`, not manual DNS records; the
`workers.dev` URL is explicitly disabled). The domain really is spelled
`poilygon.dev`. Config is `wrangler.jsonc` at the repo root; its
`assets.not_found_handling = "single-page-application"` is what makes
history-mode deep links (`/about`, `/projects/:slug`) serve `index.html` — keep
it. Deploys are CLI-only from a local machine (no git-connected builds):

```
bun run deploy                 # bun run build && wrangler deploy
```

Requires a one-time `bunx wrangler login` (OAuth). Since the deploy uploads the
local `dist/`, commit and push before deploying so the repo matches what's live.

## Architecture

The board is a single persistent grid of cells; almost everything else in the app
exists to compute *what the grid should show next* and hand it to one function.

**Data flow:** `App.vue` (mounted once, above `<RouterView>`) is the glue. On route
change it reads the current path's markdown (`content/loader.ts`), runs it through
`engine/paginate.ts` → `Frame[]` sized to the board's current column/row count, and
calls `board.setPage(frames)`. Wheel/touch/keyboard input
(`composables/useScrollPosition.ts`) calls `board.advance(delta)` to step between
frames of the *same* page without re-paginating. Crossing the mobile breakpoint
(`composables/useGridDimensions.ts`) calls `board.setGrid()` and re-paginates from
scratch.

**`stores/board.ts` is the single source of truth.** It holds three reactive
regions — `navRows`, `contentRows`, `footerRows` — plus a map of in-flight
`flips` keyed by `${globalRow}:${col}`. Every mutation funnels through `commit()`:
it diffs each region's current cells against target cells (`engine/cellDiff.ts`,
keyed on face + link/heading paint, not face alone — see the comment on
`cellKeysOf`), mutates only the changed cells in place (to keep Vue's reactivity
scoped to those cells instead of re-rendering all ~1500), and records a `CellFlip`
(a precomputed face sequence, a ripple `delayMs`, and a `serial`) for each change.
`NavBar.vue` calls `board.setNav()` on every hover-state change; `ContentView`
never renders anything itself — the actual visuals live entirely in `Board.vue`,
which sits outside `<RouterView>` so route changes never unmount it.

**`BoardCell.vue`** reads its own flip from the store (`board.flips.get(key)`) and
plays it. `.flip` (the WAAPI-animated 3D subtree) is mounted only while a cell is
actually animating — idle cells render a plain static `<span>` — so a full-board
ripple doesn't hold ~1500 permanently-composited layers. Each hop sets `textContent`
imperatively and calls `el.animate()` directly; there's no per-hop Vue reactivity.
A local generation counter (`gen`) invalidates stale `nextTick`/timer/`onfinish`
callbacks so loading → reveal → targeted-flip phases can't race each other. Icon
faces (Private Use Area code points, see `engine/characterSet.ts`) render through
`IconGlyph.vue`/`engine/icons.ts` as inline SVG instead of text.

**NavBar.vue** renders the title and menu as one line of cells, inset
`NAV_MARGIN` columns from each edge so an edge item (the title, the last menu
entry) has room for a hover hyphen on its outer side too (e2e locators account
for the shift, e.g. `.nav .cell` indices are offset by `NAV_MARGIN`). Hovering
a menu item paints it as a navy CTA and turns the rule-line dashes beneath it
into carets. Hovering the "POLYSITE" title fills it navy column-by-column over
`TITLE_DWELL_MS`, like a loading bar — it's a `LinkSpan` with no `href` (paint
without navigation, see `engine/types.ts`); reaching the end triggers a
wordmark-cycling easter egg that swaps the title through `TITLE_PHRASES` every
`TITLE_CYCLE_MS` for as long as the title stays hovered, snapping back to
`POLYSITE` on pointer leave.

**Loading intro:** `board.loading` starts `true`; every mounted cell runs
`startNoise()` — an independent, bounded-concurrency random hop loop
(`LOADING_MAX_CONCURRENT` cells mid-hop at once, regardless of grid size) — except
cells reserved for the centered `LOADING_MESSAGE` ("CLICK TO START"), which hold a
static face. The reveal is gated on both a minimum duration
(`composables/useLoadingIntro.ts`) *and* the visitor's first click/keypress (so a
click never accidentally navigates — `BoardCell.follow()` no-ops while loading) *and*
the WebAudio context actually reaching `running` (capped by
`LOADING_REVEAL_MAX_WAIT_MS`, see `audio/clack.ts`), so the reveal's clack cascade is
heard. `board.finishLoading()` then flips `loading` to `false`; each `BoardCell`
watches that and ripples its noise face to its real face on the same top-to-bottom
sweep. Reduced motion skips the noise entirely (`board.finishLoading()` called
immediately, no ripple).

**Ripple/flip timing math is centralized:** `engine/ripple.ts` (`rippleDelayMs`) maps
a cell's row depth (0=top, 1=bottom) through a configurable easing curve to a delay
within `RIPPLE_DURATION_MS`; `stores/board.ts`'s `buildFaceSequence` (backed by
`characterSet.ts`'s `randomSpinFace`, which stays within the target's character
category — letters spin through letters, etc.) builds each flip's intermediate-hop
list, widening intermediate count with row depth. Both are scaled per-commit by
`board.timingScale` (from `engine/deviceClass.ts`), so weaker devices get a gentler
sweep and fewer hops without changing the animation's character.

**Sound:** `audio/clack.ts` synthesizes short filtered noise transients at runtime
(no audio asset) and schedules one per flap-hop landing time. `foldImpacts()` thins
dense simultaneous impacts into fewer, slightly louder clacks so a big ripple reads
as an organic clatter rather than a machine-gun burst; it's pure/RNG-injectable and
unit-tested independently of WebAudio.

**Content pipeline:** `content/loader.ts` globs every `content/**/*.md` at build
time (`import.meta.glob(..., { eager: true })`) and maps file path → route
(`home.md` → `/`, `projects/foo.md` → `/projects/foo`); unmatched routes fall back
to inline 404 markdown. `engine/paginate.ts` parses a small markdown subset
(headings, paragraphs, `-`/`*` list items, `[text](href)` links, `![alt](src)`
images; emphasis markers are stripped since a flap board can't render italics/bold)
into line groups, then slices them into fixed-size `Frame`s — paragraphs split
across frame boundaries freely (book-style pagination, not a fixed-height card).
The same module also exports `toSemanticBlocks()`, an unpaginated, layout-free
parse of the whole document used only by `HiddenContent.vue` (the visually-hidden,
`aria-hidden`-free parallel DOM that gives screen readers/Ctrl+F real headings,
paragraphs, and working `RouterLink`s — the visible board is `aria-hidden`).
Content images go through a separate two-step pipeline: `content/imageLoader.ts`
(browser-side: `<img>` → canvas → `ImageData`, sampled at 2×cols × 2×rows and
cached per `src`+grid-size) feeds `engine/imageToGrid.ts`'s `pixelsToQuadrantRender`
(pure: packs each 2×2 sub-pixel block into one of the 16 quadrant block glyphs in
`QUADRANT_BY_MASK` — four sub-pixels per flap — and emits a parallel per-cell
`{fg,bg}` color grid), and `paginate.ts` pulls the cached `ImageRender` (lines +
colors) through an injected resolver so the engine itself stays framework/DOM-free.
The colors ride the pipeline as an optional `Line.colors` / `BoardCellState.color`
channel (part of a cell's diff identity), and `BoardCell.vue` paints them inline —
the one place the board departs from the off-white-on-black palette (see rule 6).
The older two-tone `pixelsToGrid`/`gridToCharLines` path is retained (still
unit-tested) but no longer wired into the loader. An image may carry an optional
trailing `{width=N align=left|center|right}` attribute (`paginate.ts`'s
`parseImageAttrs`/`IMAGE_MARKDOWN_RE`, shared with `imageLoader.ts` so preloading
requests the same size the paginator will resolve at) — `width` narrows the
render to N cells (capped at content width) instead of filling it, and `align`
picks which side the leftover columns pad; both default to full-width/`center`
(the pre-existing behavior) when omitted. A **sized left/right image floats**:
the paragraph(s) immediately after it wrap into the columns beside it (variable-
width word wrap via `wrapFlatTextVariable` — narrow next to the image, full width
once past its bottom), composed into combined image+text lines by `composeFloat`.
Floating needs the image resolved (for its true width) and at least
`MIN_FLOAT_TEXT_WIDTH` columns of text room, else the image falls back to a normal
block. Only consecutive `paragraph` blocks are pulled into the float; a heading,
list, or another image ends it. Quadrant faces have no spin
category (like `BLOCK`), so image cells flip directly rather than spinning.

**Keep `src/engine/` free of Vue and DOM globals** — it's plain TypeScript,
unit-tested directly with Vitest. `src/composables/` is where the DOM/Vue-reactive
wrappers around those engine signals live (e.g. `useDeviceClass.ts` gathers
`navigator`/`matchMedia` signals and calls `engine/deviceClass.ts`'s pure
`classifyDevice()`).

## Rules that always apply

These come directly from product decisions already made — don't relitigate them
without asking first.

1. **Only cells whose character changes flip.** Diff the current grid against the
   target grid; untouched cells (including blank-to-blank) never animate. This is
   the job of `engine/cellDiff.ts`.
2. **Short random cycle, not the full alphabet.** A cell's flip hops through a few
   random intermediate faces before landing on its target face, each hop a 180°
   rotation of `FLIP_HOP_MS`. The intermediate count is drawn from a range that
   widens with the cell's row depth (`FLIP_INTERMEDIATE_TOP_MIN`/`_TOP_MAX` →
   `_BOTTOM_MIN`/`_BOTTOM_MAX` in `src/config.ts`): flips near the top settle
   fast, flips near the bottom flap through more. Never cycle the entire
   character set the way a real board does. (Owner changed this 2026-07-06 from
   the original single-flip rule; the brief still describes
   single-flip.)
3. **Multi-cell changes ripple top-to-bottom.** When a page change touches many
   cells at once, stagger the flip start times so the wave moves top-to-bottom,
   using the ordering `cellDiff.ts` produces.
4. **The board persists across route changes.** It lives outside `<router-view>`;
   route changes update the *target content*, not the component tree. Never let a
   route change unmount/remount the board.
5. **Nav bar occupies fixed top rows** and is always present; the content region
   below it is what changes per page/scroll position.
6. **Palette:** black background, off-white characters. Two exceptions only:
   links/CTAs (navy background, off-white text), and **pixelated content images,
   which render in full color** — each image cell carries its own `{fg,bg}`
   (Owner added color images 2026-07-08; the brief still describes two-tone).
   Don't introduce color anywhere else (text, nav, chrome).
7. **Flat, not skeuomorphic** — no drop shadows, bevels, or texture on the board.
8. **Sound, flip duration, and image-pixelation granularity are code constants**,
   not a visitor-facing settings UI. Don't build a settings panel.
9. **Loading state:** before content is ready, every cell flips randomly and
   independently (no sync) for a fixed minimum duration, then settles into the real
   first frame — `Promise.all([minDurationTimer, contentReadyPromise])`, not a
   simple `setTimeout` alone.
10. **Pagination is book-style.** Paragraphs continue across frame boundaries; don't
    add logic to avoid splitting a paragraph across frames.
11. **Accessibility is a hard requirement, not a stretch goal:**
    - A visually-hidden parallel copy of the real semantic content must exist in the
      DOM so screen readers and Ctrl+F/page-search work normally.
    - Respect `prefers-reduced-motion`: skip the flip animation and show content
      directly.

## Non-goals (don't build these)

- No CMS/backend — content is Markdown files in the repo.
- No SEO work (meta tags beyond basics, sitemaps, SSR) — this is a personal/demo
  project.
- No visitor-facing settings panel.
- No special browser back/forward handling.
- No full mechanical alphabet-cycling animation.

## Conventions

- Components: `PascalCase.vue`, `<script setup lang="ts">` only.
- Pinia: setup-store syntax (`defineStore('board', () => { ... })`), not the
  options-store syntax.
- Keep `engine/` and `composables/` covered by Vitest; keep interaction/animation
  behavior covered by Playwright rather than trying to unit-test WAAPI animations.
- When adding a new page/article: add a `.md` file under `content/`, and confirm
  `content/loader.ts` picks it up via `import.meta.glob` before wiring a route to it.
- e2e tests must call `start(page)` (`e2e/helpers.ts`) to click past the loading
  intro before interacting with the board, and can `await settle(page)` to wait out
  in-flight flips. Playwright's mobile device profiles don't spoof
  `hardwareConcurrency`/`deviceMemory`, so device-tier coverage goes through
  `forceDeviceClass(page, tier)` instead.

## When something's ambiguous

If a task touches one of the "Rules that always apply" above and the brief doesn't
cover the specific case, ask before assuming — these were deliberate product
decisions, not defaults.
