import * as THREE from 'three'
import type { Species } from '../data/species'
import { toWorld, ADULT_AGE } from '../config'
import { animalModel } from './models'

const NAMES = [
  'Biscuit',
  'Maple',
  'Pickle',
  'Waffles',
  'Juniper',
  'Mochi',
  'Tango',
  'Clover',
  'Bruno',
  'Pepper',
  'Olive',
  'Sunny',
  'Nacho',
  'Poppy',
  'Ziggy',
  'Hazel',
  'Rusty',
  'Willow',
  'Pudding',
  'Echo',
]

export type AnimalStatus = 'wandering' | 'restless' | 'resting' | 'sleeping' | 'eating'

export class Animal {
  group: THREE.Group
  name = NAMES[(Math.random() * NAMES.length) | 0]
  /** Seconds lived at this zoo's pace; animals bought from the shop arrive as adults, newborns start at 0. */
  age = ADULT_AGE
  sick = false
  /** Why it fell ill, shown on its card. */
  sickCause = ''
  /** Seconds left in which a recovered animal can't be made ill again. */
  immuneT = 0
  /** Born at the zoo (sells for less than an animal bought from the shop). */
  bred = false
  /** The player has ordered breeding; waiting for a keeper on Breeding duty. */
  breedOrder = false
  /** Seconds until the baby arrives (0 = not expecting), and seconds left of the rest period after breeding. */
  pregnantT = 0
  breedCool = 0
  get isBaby() {
    return this.age < ADULT_AGE
  }
  /** 0.5 for a newborn up to 1 for an adult. */
  get growth() {
    return this.isBaby ? 0.5 + 0.5 * (this.age / ADULT_AGE) : 1
  }
  /** The game day this animal joined the zoo. */
  arrived = 1
  hunger = 20
  happiness = 100
  status: AnimalStatus = 'wandering'
  /** Short reasons the animal is unhappy, shown on hover. */
  issues: string[] = []
  /** Last tile this animal stood on that was actually enclosure, to return to if it ever strays. */
  lastPen: { x: number; y: number }
  tx: number
  ty: number
  target: THREE.Vector3 | null = null
  wait = Math.random() * 3
  restTimer = 0
  eatTimer = 0
  constructor(
    public species: Species,
    x: number,
    y: number,
  ) {
    this.lastPen = { x, y }
    this.tx = x
    this.ty = y
    this.group = animalModel(species)
    this.group.position.set(toWorld(x), 0.05, toWorld(y))
  }
}
