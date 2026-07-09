# Split-Flap Portfolio Site — Project Brief & Build Prompt

## 1. The concept, restated

One fixed-size grid of split-flap (Solari board) characters fills the screen. It
never resizes or repositions. There's no native page scroll — wheel/touch/keyboard
input instead advances a virtual "position" through the current page's content, and
each position maps to one full screen's worth of text (a "frame"). Crossing into new
content flips the affected characters to reveal it. Navigating to a different page
does the same thing, just to different content — the whole site is one board that
keeps reconfiguring itself.

**Flip behavior:** a single quick flip per character (old face rotates 180° away, new
face appears) — not a mechanical cycle through every intermediate letter like a real
departure board. **Only cells whose character actually changes between frames flip.**
Cells that stay the same — including blank-to-blank — never animate.

## 2. Confirmed design decisions

**Navigation & routing**
- A persistent nav bar occupies the top rows of the board at all times (like the
  "TRAIN INFORMATION" header + column labels in a real board — present continuously
  while the content underneath changes).
- Each page (Home / Projects / About / individual articles) has its own real,
  bookmarkable URL.
- Browser back/forward button behavior is out of scope for v1 — don't build special
  handling for it.

**Visual style**
- Flat, not skeuomorphic — clean for clarity, no heavy drop shadows/texture/bevels.
- Palette: black background, off-white characters. Links/CTAs get a navy background
  with off-white text as the one deliberate color exception.

**Typography**
- Body copy in **JetBrains Mono** (primary choice) or **IBM Plex Mono** (acceptable
  alternate) — both are open-source, multi-weight, built for long-form screen
  reading rather than pure novelty. Pick one at build time; JetBrains Mono is the
  default unless a side-by-side comparison changes that.
- Headings can use a different weight, size, or treatment from the family (not
  locked to ALL CAPS) — left as a creative call during implementation.

**Character set & non-text content**
- Full character set: uppercase, lowercase, digits, punctuation.
- Icons: **both** approaches —
  - A small fixed set of custom icon glyphs (email, external-link, arrow, social
    icons, etc.) baked into the flap character set as swappable "faces," so they
    flip like any other character.
  - Larger images (photos, screenshots) are converted to a coarse pixelated
    approximation using the grid itself, with pixelation granularity as a config
    constant (not a visitor-facing control).

**Sound**
- A mechanical "clack" plays per flip. On/off is a code-level config value, not a
  visitor-facing setting.

**Animation**
- When many cells change at once (e.g. a full page change), the flips ripple in a
  **top-to-bottom wave**.
- Flip duration and image-pixelation granularity are config constants in code —
  no visitor-facing settings panel for v1.
- **Pre-content loading state:** before any real content is available, the board
  cycles with each cell flipping randomly and independently (organic noise, not
  synchronized). This runs for a **fixed minimum duration** regardless of how fast
  content loads, so it always reads as intentional — implement as something like
  `Promise.all([minDurationTimer, contentReadyPromise])` before transitioning into
  the real first frame.

**Content & pagination**
- Long-form articles are authored in Markdown, word-wrapped to the grid's column
  width, and paginated into frames.
- Book-style pagination: paragraphs continue across frame boundaries as needed;
  don't try to avoid splitting a paragraph across frames.

**Accessibility**
- A visually-hidden parallel copy of the real content in the DOM, so screen readers
  and Ctrl+F/page-search work normally.
- A `prefers-reduced-motion` fallback that shows content without the flip animation.

## 3. Recommended tech stack

| Layer | Recommendation | Why |
|---|---|---|
| Framework | Vue 3 + TypeScript + Vite | Already your stack |
| Routing | Vue Router | Real per-page URLs; the board component lives outside `<router-view>` so it persists across navigation — only its target content changes |
| State | Pinia | Current grid, target grid, per-cell flip state, scroll/page position |
| Input handling | VueUse (`useEventListener`, `useSwipe`, `useDebounceFn`, `useResizeObserver`, `usePreferredReducedMotion`) | Avoids hand-rolling wheel/touch/keyboard/resize plumbing |
| Flip animation | CSS 3D transforms (`perspective`, `rotateX`, `backface-visibility`) | Hardware-accelerated; no library needed for a single flip |
| **Cell-diff engine** | Custom, pure TS function | Given only-changed-cells flip, you need a clean diff between the current grid and the target grid every time content changes — this is core, testable logic, independent of Vue |
| **Image-to-grid preprocessor** | Canvas API (`drawImage` + `getImageData`) + a threshold/dither step | Converts source images into a coarse two-tone (black/off-white) grid approximation at a configurable block size |
| Icon glyphs | A small curated SVG set (e.g. a subset of Lucide icons, or custom-drawn) baked into the flap character set alongside letters | Keeps icons visually consistent with the type and flip-able like any character |
| Content | Markdown files, parsed at build time | No backend/CMS needed |
| Testing | Vitest for the pagination + cell-diff logic (pure functions, high-value to test), Playwright for e2e (flip interaction, resize, reduced-motion) | |
| Hosting | Cloudflare Workers static assets (implemented — see CLAUDE.md "Deployment") | Static SPA, no SSR needed — no SEO requirement |

## 4. Still-open, left as adjustable defaults

These are numeric/structural details I haven't asked about because they're easy to
tune after the fact rather than genuine UX calls — flag if you want to lock any of
these down before building:

- Character grid size (I've been assuming ~40 cols × 20 rows on desktop).
- Whether mobile gets a narrower grid (e.g. 24 cols) below some breakpoint, rather
  than just scaling the desktop grid down (scaling down that much would make text
  too small to read).
- Exact minimum duration for the loading intro, and the block size for image
  pixelation.

## 5. Reference implementations worth skimming (not copying wholesale)

- `@splitflap/vue` — a ready-made Vue split-flap component, though it implements full
  mechanical alphabet-cycling, which is more animation than you want.
- `peruibeloko/split-flap-display` on GitHub — a Vue + CSS reference build.
- "Design Engineering: a split-flap display component" (hello-mat.com) — a
  well-documented single-flip implementation closer to your target behavior.

## 6. Ready-to-use build prompt

Copy this into a fresh Claude (or Claude Code) session to kick off the project.

---

> I'm building a personal portfolio + product showcase site with an unusual UI
> concept, and I'd like you to help me plan the architecture before we write code.
>
> **Concept**
> The entire site is one fixed grid of split-flap display characters (like an old
> train station departure board — a Solari board). There is no real page scrolling.
> Instead:
> - The grid never changes size or position on screen.
> - Scrolling the wheel/trackpad (or swiping on mobile) advances a virtual "position"
>   through the current page's content. Each position maps to one full "frame" of
>   text — however many lines fit the grid.
> - Crossing into new content flips the affected characters to reveal the new frame.
> - Navigating to a different page (Home → Projects → About → an article) triggers
>   the same flip transition to different content, so the whole site feels like one
>   continuously reconfigurable board.
> - This is a **single quick flip per character** (old face rotates 180° away, new
>   face appears) — not a mechanical cycle through every intermediate letter. **Only
>   cells whose character actually changes between the current and target frame
>   flip** — cells that stay the same, including blank-to-blank, must not animate.
> - When many cells change at once (e.g. a full page change), the flips should
>   ripple in a top-to-bottom wave rather than all firing simultaneously.
>
> **Layout**
> - A persistent nav bar occupies the top rows of the board at all times, similar to
>   a real departure board's header row, while the content region below it changes.
> - Each page (Home / Projects / About / individual articles) has its own real,
>   bookmarkable URL via Vue Router. The board component itself lives outside
>   `<router-view>` so it isn't unmounted between page changes — only its target
>   content changes. Browser back/forward behavior is out of scope for v1.
>
> **Visual style**
> - Flat, not skeuomorphic — no heavy drop shadows, bevels, or texture.
> - Palette: black background, off-white characters. Links/CTAs use a navy
>   background with off-white text as the one deliberate exception to the palette.
> - Typography: JetBrains Mono for body copy (fall back to IBM Plex Mono if you have
>   a good reason to prefer it) — both are open-source, multi-weight monospace
>   families built for long-form screen reading. Headings can use a different weight
>   or size from the same family; propose a treatment.
>
> **Character set & non-text content**
> - Full character set: uppercase, lowercase, digits, punctuation.
> - A small fixed set of custom icon glyphs (e.g. email, external-link, arrow, a
>   couple of social icons) baked into the flap character set as swappable faces, so
>   they flip like any other character.
> - Larger images are converted into a coarse pixelated approximation using the grid
>   itself — build a small canvas-based preprocessor (draw the image, sample pixel
>   brightness, threshold/dither down to the black/off-white palette) with block
>   size as a config constant.
>
> **Sound**
> - A mechanical "clack" plays per flip. On/off is a code-level config constant, not
>   a visitor-facing setting.
>
> **Loading state**
> - Before real content is available, the board shows each cell flipping randomly
>   and independently (organic noise, not synchronized) for a fixed minimum
>   duration regardless of how fast content actually loads, then settles into the
>   real first frame. Implement this as something like
>   `Promise.all([minDurationTimer, contentReadyPromise])` before transitioning.
>
> **Content & pagination**
> - Long-form articles are authored in Markdown, parsed at build time, word-wrapped
>   to the grid's column width, and paginated into frames.
> - Book-style pagination — paragraphs continue across frame boundaries as needed;
>   don't try to avoid splitting a paragraph across a frame boundary.
>
> **Accessibility (treat as a hard requirement)**
> - A visually-hidden parallel copy of the real content in the DOM so screen readers
>   and Ctrl+F/page-search work normally.
> - A `prefers-reduced-motion` fallback that shows content without the flip
>   animation.
>
> **Stack**
> - Vue 3 + TypeScript, Vite
> - Vue Router, Pinia
> - VueUse for input handling, resize observation, and reduced-motion detection
> - Plain CSS 3D transforms for the flip animation — no animation library needed
>   unless you think one earns its keep
> - Vitest for unit tests (especially the pagination and cell-diff logic), Playwright
>   for e2e
>
> **What I need from you first**
> Before writing any code, give me a short implementation plan covering:
> 1. Component tree (board, cell, nav region, content region) and how content maps
>    to cells
> 2. The cell-diff algorithm — given a current grid and a target grid, how you'd
>    compute which cells changed, in what order, to drive the top-to-bottom ripple
> 3. The text-layout/pagination engine — Markdown article → word-wrapped lines →
>    paginated frames
> 4. The image-to-grid preprocessor approach
> 5. How scroll/swipe/keyboard input becomes frame-advance events
> 6. The accessibility approach (hidden real-content DOM, reduced-motion fallback)
>
> **Non-goals for v1**
> - No CMS/backend — content lives in Markdown files in the repo
> - No SEO optimization (personal/demo project)
> - No mechanical "flip-through-every-letter" animation — keep it snappy
> - No visitor-facing settings panel — sound/flip-speed/pixelation are code config
> - No special browser back/forward handling
>
> Once we agree on the plan, we'll build it section by section.

---
