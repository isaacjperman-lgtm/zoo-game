import * as THREE from 'three'
import type { Species } from '../data/species'
import { toWorld } from '../config'
import { animalModel } from './models'

export class Animal {
  group: THREE.Group
  hunger = 20
  happiness = 100
  tx: number
  ty: number
  target: THREE.Vector3 | null = null
  wait = Math.random() * 3
  constructor(
    public species: Species,
    x: number,
    y: number,
  ) {
    this.tx = x
    this.ty = y
    this.group = animalModel(species)
    this.group.position.set(toWorld(x), 0.05, toWorld(y))
  }
}
