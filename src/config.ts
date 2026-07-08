/**
 * All site-wide tunable constants live here (see docs/split-flap-site-brief.md §4).
 * These are code-level config values — there is deliberately no visitor-facing
 * settings UI for any of them.
 */

import type { RippleCurve } from '@/engine/ripple'
export type { RippleCurve }

/**
 * Character grid dimensions (desktop). The board fills the viewport, so more
 * cells = smaller cells = smaller text and more content per frame (and, later,
 * more resolution for pixelated images). Tune these to trade text size against
 * density.
 */
export const GRID_COLS = 56
export const GRID_ROWS = 28

/**
 * Glyph size as a multiple of cell width. Independent of grid density: lower
 * this to give each character more breathing room in its cell, raise it for a
 * chunkier, more display-like look.
 */
export const CELL_FONT_RATIO = 1.4

/** Rows at the top of the board permanently reserved for the nav bar. */
export const NAV_ROWS = 2

/**
 * Bottom rows reserved for the scroll indicator: a "v" over a "^" in the
 * right corner (a diamond with a gap when both directions are available).
 */
export const FOOTER_ROWS = 2

/** Below this viewport width the board re-paginates to the narrow grid. */
export const MOBILE_BREAKPOINT_PX = 700
export const MOBILE_GRID_COLS = 28

/** Duration of one flap hop (one 180° rotation to the next face). */
export const FLIP_HOP_MS = 120

/**
 * A flip cycles through a few random intermediate faces before landing on
 * its target — a short mechanical stutter, never the full alphabet. The
 * count is drawn from an inclusive [min, max] range that widens with the
 * cell's depth on the board: flips near the top settle fast (few or no
 * intermediates), flips near the bottom flap through more. The active range
 * is interpolated per row between these TOP (row 0) and BOTTOM (last row)
 * endpoints.
 */
export const FLIP_INTERMEDIATE_TOP_MIN = 0
export const FLIP_INTERMEDIATE_TOP_MAX = 1
export const FLIP_INTERMEDIATE_BOTTOM_MIN = 2
export const FLIP_INTERMEDIATE_BOTTOM_MAX = 3

/**
 * Ripple timing for multi-cell changes (CLAUDE.md #3): a full top-to-bottom
 * sweep — from the first changed row to the last — takes RIPPLE_DURATION_MS,
 * however many rows are actually involved. RIPPLE_CURVE shapes how that
 * fixed time budget is distributed across row depth: 'linear' spaces delays
 * evenly, 'ease-in' starts slow and accelerates toward the bottom,
 * 'ease-out' starts fast and settles, 'ease-in-out' does both. See
 * engine/ripple.ts for the curve math.
 */
export const RIPPLE_DURATION_MS = 1100
export const RIPPLE_CURVE: RippleCurve = 'ease-out'

/**
 * Minimum time the random-noise loading state runs, even if content is ready
 * sooner: Promise.all([minDurationTimer, contentReadyPromise]).
 */
export const LOADING_MIN_DURATION_MS = 1000

/**
 * Pre-content loading noise (CLAUDE.md #9): every cell flips on its own random
 * cadence — one hop, a random gap, repeat — so the board reads as organic,
 * unsynchronized texture rather than a wave. Between hops a cell shows a
 * static random glyph (its `.flip` is unmounted), so the board is always full
 * but only a bounded number of cells animate at once. Code constants, no
 * visitor-facing control.
 */
export const LOADING_HOP_MS = 110
/** Floor for the gap between one cell's hops, before jitter. */
export const LOADING_GAP_MIN_MS = 90
/**
 * Target number of cells mid-flip at any instant. Each cell's gap is derived
 * from this and the total cell count, so the noise costs about the same
 * whether the grid is 44x22 or 56x28 — it scales instead of animating every
 * cell at once (which spikes the main thread on dense grids).
 */
export const LOADING_MAX_CONCURRENT = 220
/** Random +/- fraction on each computed gap so cells stay desynchronized. */
export const LOADING_GAP_JITTER = 0.6

/**
 * The reveal waits for audio to be unlocked (the visitor's first gesture) so
 * its clack cascade is actually heard — but no longer than this, after which
 * it reveals anyway (silently). Guarantees the board never hangs on the noise
 * for a visitor who doesn't interact.
 */
export const LOADING_REVEAL_MAX_WAIT_MS = 8000

/** Image pixelation granularity: character cells per image "pixel". */
export const IMAGE_BLOCK_SIZE = 1

/** Mechanical clack per flip. */
export const SOUND_ENABLED = true

/** CSS easing curve applied to every flap hop's 180° rotation. */
export const FLIP_EASING = 'cubic-bezier(0.35, 0, 0.65, 1)'

/**
 * Perf: defer mounting a cell's flip animation (its `.flip` DOM subtree +
 * WAAPI setup) until the cell's own ripple turn, instead of mounting every
 * changed cell's animation at once on commit. This is what stops a full-page
 * ripple (~700 cells) from bursting all their animation setup into a single
 * frame. Flip to false to A/B against the naive "mount everything
 * immediately, let the animation's own delay stagger it" behavior.
 */
export const DEFER_FLIP_MOUNT = true

/**
 * Sound design for the synthesized clack (src/audio/clack.ts). Nothing here
 * is a visitor-facing setting — these are code constants to tune the feel.
 */

/** Clack sample length: max(CLACK_MIN_SECONDS, FLIP_HOP_MS * CLACK_LENGTH_RATIO). */
export const CLACK_LENGTH_RATIO = 0.7
export const CLACK_MIN_SECONDS = 0.03

/** Distinct noise grains in the pool — more variety, marginally more setup cost. */
export const CLACK_POOL_SIZE = 6

/** Minimum gap between played clacks, jittered so spacing isn't perfectly even. */
export const CLACK_THROTTLE_MS = 20
export const CLACK_THROTTLE_JITTER_MS = 12

/** Extra random offset applied to each clack's scheduled start time. */
export const CLACK_START_JITTER_MS = 10

/** Per-play pitch randomization, as a fraction of normal playback rate. */
export const CLACK_PITCH_JITTER = 0.18

/** Bandpass filter sweep applied per clack, in Hz, plus its resonance. */
export const CLACK_FILTER_FREQ_MIN = 1900
export const CLACK_FILTER_FREQ_MAX = 2600
export const CLACK_FILTER_Q = 1.1

/** Base per-clack gain (before density scaling) and its per-play jitter range. */
export const CLACK_BASE_GAIN = 0.13
export const CLACK_GAIN_JITTER = 0.3
/** Hard ceiling on any single clack's gain, regardless of density. */
export const CLACK_MAX_GAIN = 0.32

/** Hard cap on simultaneous clack voices per transition (perf + avoids a wall of noise). */
export const CLACK_MAX_VOICES = 48
