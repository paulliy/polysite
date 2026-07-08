# The split-flap engine

The board you're reading this on is driven by three small TypeScript
modules: a character set, a paginator, and a cell differ. None of them
import Vue - they're pure functions that turn content into grids and
grids into flip instructions.

## Only what changes flips

Every navigation and every scroll step produces a target grid. The
differ compares it to the current grid cell by cell and emits a change
list: row, column, old face, new face. Cells that keep their character
are never touched, which includes the vast blank regions of the board -
blank to blank is not a flip.

That change list is already sorted row-major, and each change carries a
delay proportional to its row. That is the whole ripple: the top rows
start flipping first and the wave walks down the board.

## One flip, not a spin

A real Solari board cycles through the whole alphabet to reach its
letter. That's charming at an airport and exhausting on a website, so
each cell here does a single 180 degree rotation from old face to new
face. The old face rotates away, the new one is revealed behind it.

## Faces beyond the alphabet

The character set is uppercase, lowercase, digits, and punctuation,
plus a handful of icon glyphs parked in a private use area of Unicode
so they flow through pagination like ordinary letters. Anything the set
can't display is normalized - accents are stripped, and the truly
unknown becomes a question mark.

Images get the same treatment at a larger scale: a canvas samples the
source picture, averages brightness per character cell, and dithers the
result down to lit and unlit cells on the grid.

![A pixelated mountain scene rendered in board cells](/images/demo.svg)

## Try it

Head back to [projects](/projects) or the [home page](/) and watch the
top of the board start flipping before the bottom.
