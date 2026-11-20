import * as THREE from 'three'
import {
  ENTRANCE,
  toWorld,
  toTile,
  KEEPER_WAGE,
  WAGE_PER_LEVEL,
  BREEDING,
  type Duty,
  type UpgradeKind,
} from '../config'

const KEEPER_NAMES = [
  'Sam',
  'Robin',
  'Alex',
  'Casey',
  'Jordan',
  'Riley',
  'Morgan',
  'Taylor',
  'Quinn',
  'Avery',
]
import { SPECIES } from '../data/species'
import { personModel, mat } from './models'
import type { Animal } from './animal'
import type { Prop } from '../game'

abstract class Walker {
  group: THREE.Group
  path: { x: number; y: number }[] = []
  /** True while walking; drives the leg animation. */
  moving = false
  /** Temporary speed factor (guests hurry in the rain). */
  speedMul = 1
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
    const s = this.speed * this.speedMul * dt
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

/** Ordinary guests, plus the members of rare events: school kids and their teacher, and the zoo critic. */
export type VisitorKind = 'guest' | 'child' | 'teacher' | 'critic'

export class Visitor extends Walker {
  kind: VisitorKind = 'guest'
  /** School trips walk as a group: the teacher (first) leads, the kids tend to follow their choice of animal. */
  party: Visitor[] | null = null
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
  /** Things they noticed, used to write their review on the way out. */
  sawSad = 0
  sawHappy = 0
  scenery = 0
  ateFood = false
  ateTreat = false
  sawShow = false
  sawBaby = 0
  sawSick = 0
  /** Craving for ice cream; grows fast on sunny days. */
  treat = Math.random() * 30
  rained = false
  /** Price complaints (review tags) and whether they thought the visit was good value. */
  gripes = new Set<string>()
  valued = false
  /** 1 = full-price ticket; school kids pay less, their teacher nothing. Party guests don't haggle over prices. */
  ticketFactor = 1
  priceSensitive = true
  focus: Animal | null = null
  lane = (Math.random() - 0.5) * 0.3
  constructor(kind: VisitorKind = 'guest') {
    const shirt =
      kind === 'teacher'
        ? 0xd9a441
        : kind === 'critic'
          ? 0x2b2b33
          : new THREE.Color().setHSL(Math.random(), kind === 'child' ? 0.8 : 0.5, 0.5).getHex()
    super(personModel(shirt), 1.2 + Math.random() * 0.5)
    this.kind = kind
    if (kind === 'child') {
      this.group.scale.setScalar(0.72)
      this.ticketFactor = 0.5
      this.priceSensitive = false
      this.stops = 3 + Math.floor(Math.random() * 2)
      this.treat = 50 // kids want ice cream
      this.speed *= 1.1
    } else if (kind === 'teacher') {
      this.ticketFactor = 0
      this.priceSensitive = false
      this.stops = 3
      this.satisfaction = 70
    } else if (kind === 'critic') {
      this.stops = 5
      this.satisfaction = 45 // hard to impress
      const hat = new THREE.Group()
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.015, 12), mat(0x1a1a1f))
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.09, 10), mat(0x1a1a1f))
      crown.position.y = 0.05
      hat.add(brim, crown)
      hat.position.y = 0.7
      this.group.add(hat)
    }
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
  name = KEEPER_NAMES[(Math.random() * KEEPER_NAMES.length) | 0]
  /** Upgrade levels bought for this keeper, and how many animals they've fed. */
  levels: Record<UpgradeKind, number> = { speed: 0, skill: 0 }
  fed = 0
  /** Feeding keepers feed and treat; Breeding keepers only carry out the player's breeding orders. */
  duty: Duty = 'feed'
  /** The duty this keeper took the current job under. */
  job: Duty = 'feed'
  bred = 0
  constructor() {
    super(personModel(0x2a5db0, true), 2.2)
    this.group.position.set(toWorld(ENTRANCE.x), 0, toWorld(ENTRANCE.y))
  }
  /** Re-derive speed from upgrade levels. */
  applyUpgrades() {
    this.speed = 2.2 * (1 + 0.25 * this.levels.speed)
  }
  /** Hunger level at which this keeper starts to feed an animal: trained keepers don't wait as long. */
  get feedAt() {
    return 45 - 10 * this.levels.skill
  }
  get feedTime() {
    return 1.4 - 0.25 * this.levels.skill
  }
  get wage() {
    const base = KEEPER_WAGE * (1 + WAGE_PER_LEVEL * (this.levels.speed + this.levels.skill))
    return Math.round(base * (this.duty === 'breed' ? BREEDING.breederWage : 1))
  }
}
