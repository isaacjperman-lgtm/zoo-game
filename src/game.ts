import * as THREE from 'three'
import { SPECIES } from './data/species'
import {
  N,
  T_PATH,
  T_PEN,
  T_BOOTH,
  ENTRANCE,
  DESK,
  BOOTH,
  isFixed,
  KEEPER_WAGE,
  KEEPER_COST,
  DAY_LENGTH,
  COSTS,
  idx,
  inBounds,
  toTile,
  DIRS,
} from './config'
import { Animal } from './entities/animal'
import { Visitor, Keeper } from './entities/people'
import { bfs, pathTo, reachable, type Bfs } from './world/pathfinding'
import { updateAnimal } from './ai/animalAI'
import { updateKeeper } from './ai/keeperAI'
import { updateVisitors } from './ai/visitorAI'
import type { Species } from './data/species'

export class Game {
  tiles = new Uint8Array(N * N)
  money = 1000
  day = 1
  time = 0.3 // 0..1 of day, 0.25 = noon
  animals: Animal[] = []
  visitors: Visitor[] = []
  keepers: Keeper[] = []
  root = new THREE.Group()
  queue: Visitor[] = [] // guests waiting for tickets, first in line first
  guestMood = 70
  spawnTimer = 3
  totalVisitors = 0
  message = ''
  onTilesChanged = () => {}
  onMessage = (_m: string) => {}

  constructor() {
    this.ensureFixedTiles()
  }

  /** The entrance road, ticket desk and booth can't be built over. */
  private ensureFixedTiles() {
    this.tiles[idx(ENTRANCE.x, ENTRANCE.y)] = T_PATH
    this.tiles[idx(DESK.x, DESK.y)] = T_PATH
    this.tiles[idx(BOOTH.x, BOOTH.y)] = T_BOOTH
  }

  get isDay() {
    return Math.sin(this.time * Math.PI * 2) > -0.05
  }
  /** 0..100: animal happiness, blended with how guests felt on their way out. */
  get rating() {
    if (!this.animals.length) return 0
    const animals = this.animals.reduce((a, b) => a + b.happiness, 0) / this.animals.length
    return this.totalVisitors > 0 ? animals * 0.7 + this.guestMood * 0.3 : animals
  }

  tile(x: number, y: number) {
    return inBounds(x, y) ? this.tiles[idx(x, y)] : -1
  }

  // ---- building ----
  paint(x: number, y: number, type: number) {
    if (!inBounds(x, y) || isFixed(x, y)) return
    const cur = this.tiles[idx(x, y)]
    if (cur === type) return
    const cost = type === T_PATH ? COSTS.path : type === T_PEN ? COSTS.pen : 0
    if (this.money < cost) return this.onMessage('Not enough money!')
    this.money -= cost
    this.tiles[idx(x, y)] = type
    if (cur === T_PEN) this.revalidateAnimals()
    this.onTilesChanged()
  }

  revalidateAnimals() {
    this.animals = this.animals.filter((a) => {
      if (this.tile(toTile(a.group.position.x), toTile(a.group.position.z)) === T_PEN) return true
      this.root.remove(a.group)
      this.money += Math.floor(a.species.cost / 2)
      this.onMessage(`${a.species.name} lost its pen and was sold for half price`)
      return false
    })
  }

  region(x: number, y: number) {
    const seen = new Set<number>()
    const st = [[x, y]]
    const out: number[][] = []
    while (st.length) {
      const [cx, cy] = st.pop()!
      if (this.tile(cx, cy) !== T_PEN || seen.has(idx(cx, cy))) continue
      seen.add(idx(cx, cy))
      out.push([cx, cy])
      for (const [dx, dy] of DIRS) st.push([cx + dx, cy + dy])
    }
    return out
  }

  buyAnimal(sp: Species, x: number, y: number) {
    if (this.tile(x, y) !== T_PEN) return this.onMessage('Animals need to go inside a pen (brown tiles).')
    if (this.money < sp.cost) return this.onMessage('Not enough money!')
    this.money -= sp.cost
    const a = new Animal(sp, x, y)
    this.animals.push(a)
    this.root.add(a.group)
  }

  hireKeeper() {
    if (this.money < KEEPER_COST) return this.onMessage('Not enough money!')
    this.money -= KEEPER_COST
    const k = new Keeper()
    this.keepers.push(k)
    this.root.add(k.group)
  }

  feedAt(x: number, y: number) {
    const a = this.animals.find(
      (a) => toTile(a.group.position.x) === x && toTile(a.group.position.z) === y && a.hunger > 5,
    )
    if (a) this.feed(a)
  }
  feed(a: Animal) {
    if (this.money < a.species.feedCost) return this.onMessage('Not enough money for food!')
    this.money -= a.species.feedCost
    a.hunger = 0
    a.eatTimer = 2.2
  }

  // ---- pathfinding over path tiles ----
  bfs(sx: number, sy: number) {
    return bfs((x, y) => this.tile(x, y) === T_PATH, sx, sy)
  }
  pathTo(b: Bfs, gx: number, gy: number) {
    return pathTo(b, gx, gy)
  }
  /** Path tiles beside an animal's pen that are reachable in `b`, with their walking distance. */
  spotsFor(a: Animal, b: Bfs) {
    const seen = new Set<number>()
    const out: { x: number; y: number; d: number }[] = []
    for (const [rx, ry] of this.region(a.tx, a.ty))
      for (const [dx, dy] of DIRS) {
        const x = rx + dx
        const y = ry + dy
        if (this.tile(x, y) !== T_PATH || !reachable(b, x, y) || seen.has(idx(x, y))) continue
        seen.add(idx(x, y))
        out.push({ x, y, d: b.dist[idx(x, y)] })
      }
    return out
  }
  /** True if at least one animal can be seen from a path connected to the entrance. */
  hasViewingSpots() {
    const b = this.bfs(ENTRANCE.x, ENTRANCE.y)
    return this.animals.some((a) => this.spotsFor(a, b).length > 0)
  }

  // ---- simulation ----
  update(dt: number) {
    this.time += dt / DAY_LENGTH
    if (this.time >= 1) {
      this.time -= 1
      this.endDay()
    }
    for (const a of this.animals) updateAnimal(this, a, dt)
    for (const k of this.keepers) updateKeeper(this, k, dt)
    updateVisitors(this, dt)
  }

  private endDay() {
    this.day++
    const wages = this.keepers.length * KEEPER_WAGE
    if (wages) {
      this.money -= wages
      this.onMessage(`Day ${this.day}: paid keepers $${wages}`)
    }
  }

  /** Departing guests nudge the average guest mood, which counts toward the zoo rating. */
  recordGuestMood(m: number) {
    this.guestMood += (m - this.guestMood) * 0.15
  }

  // ---- save / load ----
  private resetting = false
  save() {
    if (this.resetting) return
    localStorage.setItem(
      'zoo-save',
      JSON.stringify({
        tiles: Array.from(this.tiles),
        money: this.money,
        day: this.day,
        time: this.time,
        animals: this.animals.map((a) => ({ s: a.species.id, x: a.tx, y: a.ty, h: a.hunger })),
        keepers: this.keepers.length,
      }),
    )
  }
  load() {
    const raw = localStorage.getItem('zoo-save')
    if (!raw) return false
    try {
      const d = JSON.parse(raw)
      this.tiles.set(d.tiles)
      this.ensureFixedTiles()
      this.money = d.money
      this.day = d.day
      this.time = d.time
      for (const a of d.animals) {
        const sp = SPECIES.find((s) => s.id === a.s)
        if (!sp) continue
        const an = new Animal(sp, a.x, a.y)
        an.hunger = a.h
        this.animals.push(an)
        this.root.add(an.group)
      }
      for (let i = 0; i < d.keepers; i++) {
        const k = new Keeper()
        this.keepers.push(k)
        this.root.add(k.group)
      }
      return true
    } catch {
      return false
    }
  }
  reset() {
    this.resetting = true // stops the unload autosave from re-creating the save
    localStorage.removeItem('zoo-save')
    location.reload()
  }
}
