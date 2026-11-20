import type { Game } from './game'
import { SPECIES } from './data/species'

export interface Goal {
  text: string
  reward: number
  /** Current value and the value needed to finish. */
  progress: (g: Game) => { value: number; target: number }
}

// Shown one at a time, in order. Add new goals to the end (or anywhere to reorder the tutorial flow).
export const GOALS: Goal[] = [
  { text: 'Buy your first animal', reward: 100, progress: (g) => ({ value: g.animals.length, target: 1 }) },
  { text: 'Welcome 5 guests', reward: 150, progress: (g) => ({ value: g.totalVisitors, target: 5 }) },
  { text: 'Hire a keeper', reward: 100, progress: (g) => ({ value: g.keepers.length, target: 1 }) },
  { text: 'Build a food stand', reward: 150, progress: (g) => ({ value: g.countProps('food'), target: 1 }) },
  { text: 'Own 5 animals', reward: 250, progress: (g) => ({ value: g.animals.length, target: 5 }) },
  {
    text: 'Reach a 3-star rating',
    reward: 300,
    progress: (g) => ({ value: Math.round(g.animals.length >= 3 ? g.rating : 0), target: 60 }),
  },
  {
    text: 'Add a gift shop and a restroom',
    reward: 300,
    progress: (g) => ({
      value: Math.min(1, g.countProps('gift')) + Math.min(1, g.countProps('restroom')),
      target: 2,
    }),
  },
  {
    text: 'Build a Show Stage and host a show',
    reward: 500,
    progress: (g) => ({ value: Math.min(1, g.countProps('arena')) + Math.min(1, g.showsHeld), target: 2 }),
  },
  { text: 'Welcome a baby animal', reward: 400, progress: (g) => ({ value: g.babiesBorn, target: 1 }) },
  { text: 'Build a vet clinic', reward: 250, progress: (g) => ({ value: g.countProps('vet'), target: 1 }) },
  { text: 'Welcome 50 guests', reward: 500, progress: (g) => ({ value: g.totalVisitors, target: 50 }) },
  {
    text: 'House every species',
    reward: 1000,
    progress: (g) => ({ value: new Set(g.animals.map((a) => a.species.id)).size, target: SPECIES.length }),
  },
  { text: 'Have 3 keepers on staff', reward: 400, progress: (g) => ({ value: g.keepers.length, target: 3 }) },
  { text: 'Own 12 animals', reward: 800, progress: (g) => ({ value: g.animals.length, target: 12 }) },
  { text: 'Welcome 150 guests', reward: 1200, progress: (g) => ({ value: g.totalVisitors, target: 150 }) },
  {
    text: 'Reach a 5-star rating',
    reward: 2000,
    progress: (g) => ({ value: Math.round(g.totalVisitors >= 30 ? g.rating : 0), target: 90 }),
  },
]
