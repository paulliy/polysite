import { describe, it, expect } from 'vitest'
import {
  APPLE_FACE,
  SNAKE_FACE,
  createSnake,
  snakeFaces,
  stepSnake,
  type SnakeState,
} from '@/engine/snake'

/** rng that always returns 0 → placeApple picks the first free cell. */
const first = () => 0

describe('createSnake', () => {
  it('heads at index 0 with the body trailing backward along the ring', () => {
    const snake = createSnake(10, 3, 6, first)
    expect(snake.pathLength).toBe(10)
    expect(snake.body).toEqual([0, 9, 8])
    expect(snake.maxLength).toBe(6)
    // First free cell (0,9,8 taken) is index 1.
    expect(snake.apple).toBe(1)
    expect(snake.body).not.toContain(snake.apple)
  })

  it('clamps the length cap into (startLength, pathLength)', () => {
    expect(createSnake(10, 3, 100, first).maxLength).toBe(9) // capped below pathLength
    expect(createSnake(10, 3, 2, first).maxLength).toBe(4) // floored above start length
  })
})

describe('stepSnake', () => {
  it('advances the head one cell and drops the tail when it does not eat', () => {
    const state: SnakeState = { pathLength: 10, body: [0, 9, 8], apple: 5, maxLength: 6 }
    const next = stepSnake(state, first)
    expect(next.body).toEqual([1, 0, 9])
    expect(next.apple).toBe(5)
    expect(state.body).toEqual([0, 9, 8]) // input not mutated
  })

  it('grows (keeps the tail) and respawns the apple when the head eats it', () => {
    const state: SnakeState = { pathLength: 10, body: [0, 9, 8], apple: 1, maxLength: 6 }
    const next = stepSnake(state, first)
    expect(next.body).toEqual([1, 0, 9, 8]) // grew by one
    expect(next.apple).toBe(2) // first free cell after the grown body
    expect(next.body).not.toContain(next.apple)
  })

  it('resets to a single segment once it reaches the length cap', () => {
    const state: SnakeState = { pathLength: 10, body: [3, 2, 1, 0, 9, 8], apple: 5, maxLength: 6 }
    const next = stepSnake(state, first)
    expect(next.body).toEqual([3]) // back to one segment at the head
    expect(next.apple).toBe(0) // fresh apple on the first free cell
  })

  it('wraps the head around the end of the ring', () => {
    const state: SnakeState = { pathLength: 4, body: [3], apple: 1, maxLength: 3 }
    expect(stepSnake(state, first).body).toEqual([0])
  })
})

describe('snakeFaces', () => {
  it('paints every body cell as a snake segment and the apple as the apple face', () => {
    const state: SnakeState = { pathLength: 10, body: [1, 0, 9], apple: 5, maxLength: 6 }
    const faces = snakeFaces(state)
    expect(faces.get(1)).toBe(SNAKE_FACE)
    expect(faces.get(0)).toBe(SNAKE_FACE)
    expect(faces.get(9)).toBe(SNAKE_FACE)
    expect(faces.get(5)).toBe(APPLE_FACE)
    expect(faces.size).toBe(4)
  })

  it('omits the apple when there is no free cell for one', () => {
    const state: SnakeState = { pathLength: 3, body: [0, 1, 2], apple: -1, maxLength: 3 }
    const faces = snakeFaces(state)
    expect([...faces.values()]).toEqual([SNAKE_FACE, SNAKE_FACE, SNAKE_FACE])
  })
})
