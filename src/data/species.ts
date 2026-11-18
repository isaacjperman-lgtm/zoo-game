// Add new animals here! Everything else (shop, models, needs) reads from this list.
export interface Species {
  id: string
  name: string
  cost: number
  color: number
  accent: number
  size: number // body scale
  neck: number // 0 = none, >0 = neck height (giraffe)
  hungerRate: number // hunger points per second
  feedCost: number
  space: number // pen tiles wanted per animal to be happy
}

export const SPECIES: Species[] = [
  {
    id: 'zebra',
    name: 'Zebra',
    cost: 200,
    color: 0xf2f2f2,
    accent: 0x222222,
    size: 0.5,
    neck: 0,
    hungerRate: 1.6,
    feedCost: 4,
    space: 6,
  },
  {
    id: 'giraffe',
    name: 'Giraffe',
    cost: 400,
    color: 0xe0b040,
    accent: 0x8a5a14,
    size: 0.55,
    neck: 0.8,
    hungerRate: 1.2,
    feedCost: 6,
    space: 9,
  },
  {
    id: 'elephant',
    name: 'Elephant',
    cost: 700,
    color: 0x8d8d99,
    accent: 0x6c6c78,
    size: 0.8,
    neck: 0,
    hungerRate: 1.0,
    feedCost: 12,
    space: 14,
  },
  {
    id: 'lion',
    name: 'Lion',
    cost: 500,
    color: 0xd9a441,
    accent: 0x7a4a14,
    size: 0.45,
    neck: 0,
    hungerRate: 2.0,
    feedCost: 9,
    space: 10,
  },
  {
    id: 'penguin',
    name: 'Penguin',
    cost: 120,
    color: 0x1c1c24,
    accent: 0xffffff,
    size: 0.25,
    neck: 0.15,
    hungerRate: 2.2,
    feedCost: 2,
    space: 3,
  },
]
