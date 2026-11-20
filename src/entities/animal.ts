import * as THREE from 'three'
import type { Species } from '../data/species'
import { toWorld } from '../config'
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
