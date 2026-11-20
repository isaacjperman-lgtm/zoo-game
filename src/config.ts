// Tunable numbers and grid helpers. Change gameplay balance here.
export const N = 40
export const T_GRASS = 0,
  T_PATH = 1,
  T_PEN = 2,
  T_BOOTH = 3
export const ENTRANCE = { x: N >> 1, y: N - 1 }
export const ADMISSION = 10 // default ticket price, paid at the booth (the player can change it)
// Guests queue on the entrance road, register at the DESK tile, and the ticket BOOTH building sits beside it.
export const DESK = { x: ENTRANCE.x, y: ENTRANCE.y - 1 }
export const BOOTH = { x: ENTRANCE.x + 1, y: ENTRANCE.y - 1 }
/** Tiles the player can't build on or remove. */
export const isFixed = (x: number, y: number) =>
  (x === ENTRANCE.x && y === ENTRANCE.y) || (x === DESK.x && y === DESK.y) || (x === BOOTH.x && y === BOOTH.y)
export const FOOD_PRICE = 8 // default price of a snack at a food stand
export const GIFT_PRICE = 14 // default price of a souvenir
/** Player-set prices: default and the allowed range. */
export const PRICE_LIMITS = {
  ticket: { def: ADMISSION, min: 0, max: 60 },
  food: { def: FOOD_PRICE, min: 0, max: 40 },
  gift: { def: GIFT_PRICE, min: 0, max: 80 },
  icecream: { def: 5, min: 0, max: 25 },
  show: { def: 6, min: 0, max: 40 },
}
export type PriceKind = keyof typeof PRICE_LIMITS
export const ADULT_AGE = 240 // seconds of game time for a baby animal to grow up (about a day and a half)
export const TREAT_COST = 30
/** Sickness balance. Illness should punish neglect, not bad luck: it is rare in a well-kept zoo and passes within a day or two. */
export const SICKNESS = {
  baseRisk: 0.0001, // per second, for any animal
  hungerAbove: 85, // being left this hungry adds risk...
  hungerRisk: 0.002,
  unhappyBelow: 25, // ...as does being this unhappy (cramped, lonely, scared)
  unhappyRisk: 0.0015,
  clinicFactor: 0.5, // a vet clinic's preventive care halves all risk
  recovery: 0.005, // per second chance of getting better alone (about 3 minutes, a day and a quarter)
  immunity: 150, // seconds after recovering during which it can't fall ill again
  happinessPenalty: 20,
}
/**
 * Breeding is ordered by the player and carried out by a keeper on Breeding duty. These numbers keep it from being a
 * money machine: the fee, the keeper's higher wage and the low resale value of bred animals roughly cancel out any profit.
 */
export const BREEDING = {
  feeRate: 0.15, // fee per order, as a share of the species price
  minFee: 20,
  restAfterBirth: 225, // seconds (1.5 days) before an animal can be ordered to breed again
  partnerRest: 120, // the other parent needs a shorter break
  minHappiness: 60, // both parents must be at least this happy...
  maxHunger: 60, // ...and no hungrier than this
  bredResale: 0.15, // bred animals sell for this share of the species price (bought ones sell for half)
  breederWage: 1.25, // wage multiplier for a keeper on Breeding duty
  workTime: 3.5, // seconds a keeper spends with the pair
}
export type Duty = 'feed' | 'breed' // medicine for one sick animal
export const KEEPER_WAGE = 25
export const KEEPER_COST = 150
/** Keeper upgrades: each can be bought up to `max` times; level n costs `cost * (n + 1)`. Each level adds to the daily wage. */
export const KEEPER_UPGRADES = {
  speed: { name: 'Running shoes', blurb: 'Walks 25% faster per level', max: 3, cost: 120 },
  skill: { name: 'Animal training', blurb: 'Feeds earlier and faster per level', max: 3, cost: 150 },
}
export type UpgradeKind = keyof typeof KEEPER_UPGRADES
export const WAGE_PER_LEVEL = 0.3 // wage rises by this fraction of the base per upgrade level
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
