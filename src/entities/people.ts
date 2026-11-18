import * as THREE from 'three'
import { ENTRANCE, toWorld, toTile } from '../config'
import { SPECIES } from '../data/species'
import { personModel } from './models'
import type { Animal } from './animal'

abstract class Walker {
  group: THREE.Group
  path: { x: number; y: number }[] = []
  /** True while walking; drives the leg animation. */
  moving = false
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
  /** Walk straight toward a world position. Returns true on arrival. */
  moveTo(x: number, z: number, dt: number) {
    const p = this.group.position
    const dx = x - p.x
    const dz = z - p.z
    const d = Math.hypot(dx, dz)
    const s = this.speed * dt
    if (d <= s) {
      p.x = x
      p.z = z
      this.moving = false
      return true
    }
    p.x += (dx / d) * s
    p.z += (dz / d) * s
    this.group.rotation.y = Math.atan2(dx, dz)
    this.moving = true
    return false
  }
  face(x: number, z: number) {
    const p = this.group.position
    this.group.rotation.y = Math.atan2(x - p.x, z - p.z)
  }
  /** Follow the tile path. Returns true when finished. */
  step(dt: number) {
    if (!this.path.length) {
      this.moving = false
      return true
    }
    const n = this.path[0]
    if (this.moveTo(toWorld(n.x), toWorld(n.y), dt)) this.path.shift()
    this.moving = this.path.length > 0
    return this.path.length === 0
  }
}

export type VisitorState = 'queue' | 'register' | 'walking' | 'watching' | 'leaving'

export class Visitor extends Walker {
  state: VisitorState = 'queue'
  timer = 0
  /** How many more enclosures they want to see before going home. */
  stops = 2 + Math.floor(Math.random() * 3)
  satisfaction = 60
  patience = 45 + Math.random() * 30
  waited = 0
  favorite = SPECIES[(Math.random() * SPECIES.length) | 0].id
  visited = new Set<Animal>()
  focus: Animal | null = null
  lane = (Math.random() - 0.5) * 0.3
  constructor() {
    super(personModel(new THREE.Color().setHSL(Math.random(), 0.5, 0.5).getHex()), 1.2 + Math.random() * 0.5)
    // arrive from down the road, outside the gate
    this.group.position.set(toWorld(ENTRANCE.x) + (Math.random() - 0.5) * 1.5, 0, toWorld(ENTRANCE.y) + 10)
    this.group.rotation.y = Math.PI
  }
}

export type KeeperPhase = 'idle' | 'walk' | 'enter' | 'feed' | 'exit'

export class Keeper extends Walker {
  phase: KeeperPhase = 'idle'
  target: Animal | null = null
  /** Path tile beside the pen the keeper stepped in from, and returns to. */
  exit: { x: number; y: number } | null = null
  timer = 0
  constructor() {
    super(personModel(0x2a5db0, true), 2.2)
    this.group.position.set(toWorld(ENTRANCE.x), 0, toWorld(ENTRANCE.y))
  }
}
