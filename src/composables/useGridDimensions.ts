import { computed, type ComputedRef } from 'vue'
import { useMediaQuery } from '@vueuse/core'
import {
  GRID_COLS,
  GRID_ROWS,
  MOBILE_BREAKPOINT_PX,
  MOBILE_GRID_COLS,
  MOBILE_GRID_ROWS,
} from '@/config'

export interface GridDimensions {
  cols: number
  rows: number
}

/**
 * The active board dimensions for the viewport (brief §4): the desktop grid,
 * or the narrower/taller mobile grid below the breakpoint. Reactive, so the
 * board re-paginates when the viewport crosses the breakpoint.
 */
export function useGridDimensions(): ComputedRef<GridDimensions> {
  const isNarrow = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT_PX}px)`)
  return computed(() =>
    isNarrow.value
      ? { cols: MOBILE_GRID_COLS, rows: MOBILE_GRID_ROWS }
      : { cols: GRID_COLS, rows: GRID_ROWS },
  )
}
