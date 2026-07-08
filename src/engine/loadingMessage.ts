import { BLANK } from './characterSet'

/**
 * Map a loading prompt (e.g. "CLICK TO START") onto a centered strip of the
 * board, so it reads as an island of legible characters amid the loading noise.
 * Returns `${row}:${col}` → face for each covered cell; BoardCell holds these
 * cells static (no flapping) through the intro, then flips them to real content
 * on the reveal.
 *
 * Spaces map to BLANK so the words are separated by stillness rather than noise.
 * Returns an empty map when the text is empty or too wide to fit, so callers can
 * simply fall back to plain noise everywhere.
 */
export function loadingMessageCells(
  cols: number,
  rows: number,
  text: string,
): Map<string, string> {
  const cells = new Map<string, string>()
  if (!text || cols <= 0 || rows <= 0 || text.length > cols) return cells
  const row = Math.floor((rows - 1) / 2)
  const startCol = Math.floor((cols - text.length) / 2)
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] ?? ' '
    cells.set(`${row}:${startCol + i}`, ch === ' ' ? BLANK : ch)
  }
  return cells
}
