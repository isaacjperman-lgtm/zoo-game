import * as THREE from 'three'
import { ENTRANCE, toWorld, toTile } from '../config'
import { SPECIES } from '../data/species'
import { personModel } from './models'
import type { Animal } from './animal'
import type { Prop } from '../game'

abstract class Walker {
  group: THREE.Group
  path: { x: number; y: number }[] = []
  /** True while walking; drives the leg animation. */
  moving = false
  /** Unit heading while moving; used to let walkers sidestep each other. */
  hx = 0
  hz = 0
  /** How far right of the path's center line this walker keeps, so people going opposite ways pass cleanly. */
  keep = 0.15 + Math.random() * 0.07
  private segPath: unknown = null
  private segX = 0
  private segY = 0
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
    this.hx = dx / d
    this.hz = dz / d
    p.x += this.hx * s
    p.z += this.hz * s
    this.group.rotation.y = Math.atan2(dx, dz)
    this.moving = true
    return false
  }
  face(x: number, z: number) {
    const p = this.group.position
    this.group.rotation.y = Math.atan2(x - p.x, z - p.z)
  }
  /** Follow the tile path, keeping to the right-hand side. Returns true when finished. */
  step(dt: number) {
    if (!this.path.length) {
      this.moving = false
      return true
    }
    if (this.segPath !== this.path) {
      // new route: the first segment starts from the tile we're standing on
      this.segPath = this.path
      this.segX = this.px
      this.segY = this.py
    }
    const n = this.path[0]
    const dx = Math.sign(n.x - this.segX)
    const dy = Math.sign(n.y - this.segY)
    // right-hand side of the direction of travel (x east, z south)
    const ox = -dy * this.keep
    const oz = dx * this.keep
    if (this.moveTo(toWorld(n.x) + ox, toWorld(n.y) + oz, dt)) {
      this.segX = n.x
      this.segY = n.y
      this.path.shift()
    }
    this.moving = this.path.length > 0
    return this.path.length === 0
  }
}

export type VisitorState = 'queue' | 'register' | 'walking' | 'watching' | 'using' | 'leaving'

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
  /** Needs grow while touring; past a threshold the guest looks for a food stand or restroom. */
  food = Math.random() * 30
  bladder = Math.random() * 30
  complained = new Set<string>()
  /** Building they are walking to or using (food stand, restroom, gift shop). */
  errand: Prop | null = null
  shopped = false
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
  /** Gate tile of the pen being worked in; keepers pass through it on the way in and out. */
  gate: { x: number; y: number } | null = null
  timer = 0
  constructor() {
    super(personModel(0x2a5db0, true), 2.2)
    this.group.position.set(toWorld(ENTRANCE.x), 0, toWorld(ENTRANCE.y))
  }
}
