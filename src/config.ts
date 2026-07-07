/**
 * All site-wide tunable constants live here (see docs/split-flap-site-brief.md §4).
 * These are code-level config values — there is deliberately no visitor-facing
 * settings UI for any of them.
 */

/** Character grid dimensions (desktop). */
export const GRID_COLS = 44
export const GRID_ROWS = 22

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
export const FLIP_INTERMEDIATE_BOTTOM_MIN = 3
export const FLIP_INTERMEDIATE_BOTTOM_MAX = 6

/** Delay added per row so multi-cell changes ripple top-to-bottom. */
export const RIPPLE_ROW_STAGGER_MS = 18

/**
 * Minimum time the random-noise loading state runs, even if content is ready
 * sooner: Promise.all([minDurationTimer, contentReadyPromise]).
 */
export const LOADING_MIN_DURATION_MS = 1600

/** Image pixelation granularity: character cells per image "pixel". */
export const IMAGE_BLOCK_SIZE = 1

/** Mechanical clack per flip. */
export const SOUND_ENABLED = true
