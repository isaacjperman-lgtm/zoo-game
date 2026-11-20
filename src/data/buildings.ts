// Add new buildings and decorations here, then give them a model in src/entities/props.ts.
export interface BuildingDef {
  id: string
  name: string
  cost: number
  kind: 'service' | 'decor'
  tip: string
}

export const BUILDINGS: BuildingDef[] = [
  {
    id: 'food',
    name: 'Food Stand',
    cost: 80,
    kind: 'service',
    tip: 'Hungry guests buy snacks here. Build it on grass beside a path.',
  },
  {
    id: 'restroom',
    name: 'Restroom',
    cost: 60,
    kind: 'service',
    tip: 'Guests need a break now and then. Free to use, and it keeps them happy.',
  },
  {
    id: 'gift',
    name: 'Gift Shop',
    cost: 120,
    kind: 'service',
    tip: 'Guests browse here on their way out and buy souvenirs.',
  },
  {
    id: 'tree',
    name: 'Tree',
    cost: 15,
    kind: 'decor',
    tip: 'Scenery makes guests happier. Decorations within 3 tiles of a viewing spot help.',
  },
  {
    id: 'flowers',
    name: 'Flowers',
    cost: 8,
    kind: 'decor',
    tip: 'A cheap splash of color. Decorations near viewing spots raise guest mood.',
  },
  {
    id: 'bench',
    name: 'Bench',
    cost: 25,
    kind: 'decor',
    tip: 'A place to rest. Decorations near viewing spots raise guest mood.',
  },
  {
    id: 'lamp',
    name: 'Lamp',
    cost: 20,
    kind: 'decor',
    tip: 'Lights up at night, and counts as decoration for guest mood.',
  },
]
