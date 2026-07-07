# CLAUDE.md

This file gives Claude Code persistent context for this project. Full rationale and
design decisions live in `docs/split-flap-site-brief.md` — read that first if
anything here is unclear or you need the "why" behind a rule.

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
- Plain CSS 3D transforms for the flip animation — no animation library
- Markdown content, parsed at build time
- Vitest (unit) + Playwright (e2e)
- Bun as package manager and script runner
- ESLint (flat config) + Prettier

## Commands

```
bun install              # install deps
bun run dev               # local dev server
bun run build              # type-check + production build
bun run preview             # preview the production build
bun run test:unit            # vitest
bun run test:e2e             # playwright
bun run lint               # eslint --fix
bun run format               # prettier --write
```

## Initial scaffold

This is an empty repo. Bootstrap with:

```
bun create vue@latest .
```

Select: TypeScript, Vue Router, Pinia, Vitest, ESLint, Prettier, Playwright (skip
Cypress, skip JSX). Then wire ESLint's flat config so `eslint-plugin-vue`'s
`flat/essential` (or `flat/recommended`) and `@vue/eslint-config-typescript`'s
`vueTsConfigs.recommended` are combined via `eslint-config-prettier` last in the
config array, so Prettier owns formatting and ESLint owns everything else.

## Project structure

```
content/
  home.md, about.md, projects/<slug>.md   # long-form article source
public/fonts/                              # self-hosted JetBrains Mono (or IBM Plex Mono) woff2
src/
  App.vue
  router/index.ts
  stores/board.ts          # current grid, target grid, per-cell flip state, position
  components/
    Board.vue              # the grid of BoardCell components
    BoardCell.vue           # single flap unit
    NavBar.vue              # persistent top rows
    HiddenContent.vue        # a11y parallel DOM (see Accessibility below)
  engine/
    paginate.ts             # markdown -> word-wrapped lines -> paginated frames
    cellDiff.ts              # current grid vs target grid -> changed cells + ripple order
    imageToGrid.ts            # canvas-based image -> pixelated two-tone grid
    characterSet.ts            # full alphabet + digits + punctuation + icon glyphs
  composables/
    useScrollPosition.ts       # wheel/touch/keyboard -> frame index
    useReducedMotion.ts
  content/loader.ts            # import.meta.glob markdown loader
  assets/sounds/clack.mp3
  styles/tokens.css             # color + typography CSS variables
tests/
  unit/paginate.test.ts, cellDiff.test.ts
  e2e/flip.spec.ts
docs/split-flap-site-brief.md
```

Adjust as the project evolves, but keep `engine/` free of Vue imports — those
modules should be plain, framework-agnostic TypeScript that's easy to unit test.

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
6. **Palette:** black background, off-white characters. Links/CTAs are the one
   exception — navy background, off-white text. Don't introduce other colors.
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
  behavior covered by Playwright rather than trying to unit-test CSS animations.
- When adding a new page/article: add a `.md` file under `content/`, and confirm
  `content/loader.ts` picks it up via `import.meta.glob` before wiring a route to it.

## When something's ambiguous

If a task touches one of the "Rules that always apply" above and the brief doesn't
cover the specific case, ask before assuming — these were deliberate product
decisions, not defaults.
