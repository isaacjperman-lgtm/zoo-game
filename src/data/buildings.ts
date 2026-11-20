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
    id: 'icecream',
    name: 'Ice Cream Stand',
    cost: 90,
    kind: 'service',
    tip: 'Hot days make guests crave a cone. Sells at the price you set in Prices.',
  },
  {
    id: 'arena',
    name: 'Show Stage',
    cost: 400,
    kind: 'service',
    tip: 'Hosts two shows a day. Guests flock to it and pay the show ticket.',
  },
  {
    id: 'vet',
    name: 'Vet Clinic',
    cost: 300,
    kind: 'service',
    tip: 'Keepers can treat sick animals while a clinic is open. Medicine costs $30 each.',
  },
  {
    id: 'fountain',
    name: 'Fountain',
    cost: 90,
    kind: 'decor',
    tip: 'A grand centerpiece. Counts as decoration for guest mood.',
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
