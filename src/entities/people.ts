import * as THREE from 'three'
import { ENTRANCE, toWorld, toTile } from '../config'
import { personModel } from './models'
import type { Animal } from './animal'

abstract class Walker {
  group: THREE.Group
  path: { x: number; y: number }[] = []
  constructor(
    group: THREE.Group,
    public speed: number,
  ) {
    this.group = group
  }
  get px() {
    return toTile(this.group.position.x)
  }
  get py() {
    return toTile(this.group.position.z)
  }
  /** moves along path; returns true when finished */
  step(dt: number) {
    if (!this.path.length) return true
    const n = this.path[0]
    const tx = toWorld(n.x) + (Math.random() - 0.5) * 0.002,
      tz = toWorld(n.y)
    const dx = tx - this.group.position.x,
      dz = tz - this.group.position.z
    const d = Math.hypot(dx, dz),
      s = this.speed * dt
    if (d <= s) {
      this.group.position.x = tx
      this.group.position.z = tz
      this.path.shift()
    } else {
      this.group.position.x += (dx / d) * s
      this.group.position.z += (dz / d) * s
      this.group.rotation.y = Math.atan2(dx, dz)
    }
    return this.path.length === 0
  }
}

export class Visitor extends Walker {
  state: 'walking' | 'watching' | 'leaving' = 'walking'
  timer = 0
  stops = 1 + Math.floor(Math.random() * 3)
  constructor() {
    super(personModel(new THREE.Color().setHSL(Math.random(), 0.5, 0.5).getHex()), 1.2 + Math.random() * 0.5)
    this.group.position.set(toWorld(ENTRANCE.x), 0, toWorld(ENTRANCE.y))
  }
}

export class Keeper extends Walker {
  target: Animal | null = null
  constructor() {
    super(personModel(0x2a5db0, true), 2.2)
    this.group.position.set(toWorld(ENTRANCE.x), 0, toWorld(ENTRANCE.y))
  }
}
