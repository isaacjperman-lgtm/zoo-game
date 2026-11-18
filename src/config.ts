// Tunable numbers and grid helpers. Change gameplay balance here.
export const N = 40
export const T_GRASS = 0,
  T_PATH = 1,
  T_PEN = 2,
  T_BOOTH = 3
export const ENTRANCE = { x: N >> 1, y: N - 1 }
export const ADMISSION = 10 // ticket price, paid at the booth
// Guests queue on the entrance road, register at the DESK tile, and the ticket BOOTH building sits beside it.
export const DESK = { x: ENTRANCE.x, y: ENTRANCE.y - 1 }
export const BOOTH = { x: ENTRANCE.x + 1, y: ENTRANCE.y - 1 }
/** Tiles the player can't build on or remove. */
export const isFixed = (x: number, y: number) =>
  (x === ENTRANCE.x && y === ENTRANCE.y) || (x === DESK.x && y === DESK.y) || (x === BOOTH.x && y === BOOTH.y)
export const KEEPER_WAGE = 25
export const KEEPER_COST = 150
export const DAY_LENGTH = 150 // seconds
export const COSTS = { path: 5, pen: 10 }

export const idx = (x: number, y: number) => y * N + x
export const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N
export const toWorld = (t: number) => t - N / 2 + 0.5
export const toTile = (w: number) => Math.floor(w + N / 2)
export const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
