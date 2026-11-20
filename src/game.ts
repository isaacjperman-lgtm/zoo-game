import * as THREE from 'three'
import { SPECIES } from './data/species'
import {
  N,
  T_GRASS,
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
  PRICE_LIMITS,
  COSTS,
  idx,
  inBounds,
  toTile,
  toWorld,
  DIRS,
} from './config'
import { Animal } from './entities/animal'
import { Visitor, Keeper } from './entities/people'
import { bfs, pathTo, reachable, type Bfs } from './world/pathfinding'
import { updateAnimal } from './ai/animalAI'
import { updateKeeper } from './ai/keeperAI'
import { updateVisitors, spawnSchoolTrip, spawnCritic } from './ai/visitorAI'
import { resolveCollisions } from './world/collision'
import { BUILDINGS } from './data/buildings'
import { propModel } from './entities/props'
import { GOALS } from './goals'
import type { Species } from './data/species'
import type { Review } from './ai/reviews'

export interface Prop {
  id: string
  x: number
  y: number
  group: THREE.Group
}

export class Game {
  tiles = new Uint8Array(N * N)
  money = 1000
  zooName = 'Zoo Keeper'
  ticketPrice = PRICE_LIMITS.ticket.def
  foodPrice = PRICE_LIMITS.food.def
  giftPrice = PRICE_LIMITS.gift.def
  day = 1
  time = 0.3 // 0..1 of day, 0.25 = noon
  animals: Animal[] = []
  visitors: Visitor[] = []
  keepers: Keeper[] = []
  root = new THREE.Group()
  props = new Map<number, Prop>() // buildings and decorations, keyed by tile index
  /** Enclosure tiles with a gate. Keepers can only enter or leave a pen through a gate beside a path. */
  gates = new Set<number>()
  goalIndex = 0
  private goalTimer = 0
  queue: Visitor[] = [] // guests waiting for tickets, first in line first
  guestMood = 70
  spawnTimer = 3
  totalVisitors = 0
  message = ''
  onTilesChanged = () => {}
  onMessage = (_m: string) => {}
  /** Fired whenever guests pay, with the world position of the payment. */
  onIncome = (_x: number, _z: number, _amount: number) => {}
  /** What each guest told the zoo on the way out (newest last), shown in the Reviews panel. */
  reviews: Review[] = []
  onSound = (_name: 'build' | 'hire' | 'goal') => {}

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

  /**
   * What guests think each thing is worth. A better zoo can charge more: the fair price grows with the rating.
   * Charging above it annoys guests (and, for tickets, keeps some of them away); charging below it pleases them.
   */
  get fair() {
    const r = Math.max(30, this.rating)
    return { ticket: 5 + r * 0.2, food: 6 + r * 0.05, gift: 8 + r * 0.14 }
  }
  /** 0.3..1.4: how many guests turn up relative to normal at the current ticket price. */
  get demand() {
    return Math.min(1.4, Math.max(0.3, this.fair.ticket / Math.max(1, this.ticketPrice)))
  }

  setPrice(kind: 'ticket' | 'food' | 'gift', v: number) {
    const lim = PRICE_LIMITS[kind]
    const n = Math.min(lim.max, Math.max(lim.min, Math.round(v)))
    if (kind === 'ticket') this.ticketPrice = n
    else if (kind === 'food') this.foodPrice = n
    else this.giftPrice = n
  }

  tile(x: number, y: number) {
    return inBounds(x, y) ? this.tiles[idx(x, y)] : -1
  }

  // ---- building ----
  paint(x: number, y: number, type: number) {
    if (!inBounds(x, y) || isFixed(x, y)) return
    const prop = this.props.get(idx(x, y))
    if (prop) {
      if (type !== T_GRASS) return this.onMessage('Clear the building first.')
      return this.removeProp(prop)
    }
    const cur = this.tiles[idx(x, y)]
    if (cur === type) return
    const cost = type === T_PATH ? COSTS.path : type === T_PEN ? COSTS.pen : 0
    if (this.money < cost) return this.onMessage('Not enough money!')
    this.money -= cost
    this.tiles[idx(x, y)] = type
    this.regionCache.clear()
    if (cur === T_PEN) {
      this.gates.delete(idx(x, y))
      this.revalidateAnimals()
    }
    this.orientProps()
    this.autoGates()
    this.onSound('build')
    this.onTilesChanged()
  }

  // ---- gates (added automatically where an enclosure meets a path) ----
  /** True if some tile of this pen has a gate. */
  hasGate(reg: number[][]) {
    return reg.some(([x, y]) => this.gates.has(idx(x, y)))
  }
  /** Gate openings of an animal's pen that a keeper can reach: the path tile outside and the gate tile inside. */
  gateSpotsFor(a: Animal, b: Bfs) {
    const out: { x: number; y: number; d: number; gx: number; gy: number }[] = []
    for (const [gx, gy] of this.region(a.tx, a.ty)) {
      if (!this.gates.has(idx(gx, gy))) continue
      for (const [dx, dy] of DIRS) {
        const x = gx + dx
        const y = gy + dy
        if (this.tile(x, y) === T_PATH && reachable(b, x, y)) out.push({ x, y, d: b.dist[idx(x, y)], gx, gy })
      }
    }
    return out
  }

  // ---- buildings and decorations ----
  placeProp(id: string, x: number, y: number) {
    const def = BUILDINGS.find((b) => b.id === id)
    if (!def || !inBounds(x, y) || isFixed(x, y)) return
    if (this.tile(x, y) !== T_GRASS) return this.onMessage('Buildings go on open grass.')
    if (this.props.has(idx(x, y))) return this.onMessage('Something is already built there.')
    if (this.money < def.cost) return this.onMessage('Not enough money!')
    this.money -= def.cost
    this.addProp(id, x, y)
    this.orientProps()
    this.onSound('build')
  }

  private addProp(id: string, x: number, y: number) {
    const group = propModel(id)
    group.position.set(toWorld(x), 0.05, toWorld(y))
    this.root.add(group)
    this.props.set(idx(x, y), { id, x, y, group })
  }

  private removeProp(p: Prop) {
    this.root.remove(p.group)
    this.props.delete(idx(p.x, p.y))
    this.money += Math.floor((BUILDINGS.find((b) => b.id === p.id)?.cost ?? 0) / 2)
    this.onSound('build')
  }

  /** Turn each prop to face the nearest path tile. */
  orientProps() {
    for (const p of this.props.values())
      for (const [dx, dy] of DIRS)
        if (this.tile(p.x + dx, p.y + dy) === T_PATH) {
          p.group.rotation.y = Math.atan2(dx, dy)
          break
        }
  }

  countProps(id: string) {
    let n = 0
    for (const p of this.props.values()) if (p.id === id) n++
    return n
  }

  /** Nearest reachable building of this kind and the path tile to stand on to use it. */
  nearestService(id: string, b: Bfs) {
    let best: { prop: Prop; spot: { x: number; y: number; d: number } } | null = null
    for (const p of this.props.values()) {
      if (p.id !== id) continue
      for (const [dx, dy] of DIRS) {
        const x = p.x + dx
        const y = p.y + dy
        if (this.tile(x, y) !== T_PATH || !reachable(b, x, y)) continue
        const d = b.dist[idx(x, y)]
        if (!best || d < best.spot.d) best = { prop: p, spot: { x, y, d } }
      }
    }
    return best
  }

  /** Decorations within 3 tiles of a tile (a guest's viewing spot). */
  decorNear(x: number, y: number) {
    let n = 0
    for (const p of this.props.values()) {
      if (BUILDINGS.find((b) => b.id === p.id)?.kind !== 'decor') continue
      if (Math.abs(p.x - x) <= 3 && Math.abs(p.y - y) <= 3) n++
    }
    return n
  }

  /** Pay the zoo, with a floating "+$" at the given world position. */
  earn(amount: number, x: number, z: number) {
    if (amount <= 0) return
    this.money += amount
    this.onIncome(x, z, amount)
  }

  // ---- goals ----
  get currentGoal() {
    const goal = GOALS[this.goalIndex]
    return goal ? { goal, ...goal.progress(this) } : null
  }
  private checkGoals() {
    let g = this.currentGoal
    while (g && g.value >= g.target) {
      this.money += g.goal.reward
      this.goalIndex++
      this.onMessage(`Goal complete: ${g.goal.text}  (+$${g.goal.reward})`)
      this.onSound('goal')
      g = this.currentGoal
    }
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

  /** Pen regions are looked up by every animal every frame, so cache them until the tiles change. */
  private regionCache = new Map<number, number[][]>()
  region(x: number, y: number) {
    const key = idx(x, y)
    const hit = this.regionCache.get(key)
    if (hit) return hit
    const out = this.floodRegion(x, y)
    for (const [rx, ry] of out) this.regionCache.set(idx(rx, ry), out)
    if (!out.length) this.regionCache.set(key, out)
    return out
  }
  private floodRegion(x: number, y: number) {
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
    this.onSound('build')
    const a = new Animal(sp, x, y)
    a.arrived = this.day
    this.animals.push(a)
    this.root.add(a.group)
  }

  /** Sell an animal for half its price. */
  sellAnimal(a: Animal) {
    const i = this.animals.indexOf(a)
    if (i < 0) return
    this.animals.splice(i, 1)
    this.root.remove(a.group)
    this.money += Math.floor(a.species.cost / 2)
    this.onSound('build')
    this.onMessage(`Sold ${a.name} for $${Math.floor(a.species.cost / 2)}`)
  }

  hireKeeper() {
    if (this.money < KEEPER_COST) return this.onMessage('Not enough money!')
    this.money -= KEEPER_COST
    this.onSound('hire')
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

  // ---- rare events ----
  /** Special visits scheduled for later today, as a fraction of the day. */
  events: { kind: 'school' | 'critic'; at: number }[] = []
  /** Start an event now (also handy from the console: `game.startEvent('school')`). */
  startEvent(kind: 'school' | 'critic') {
    if (!this.animals.length || !this.hasViewingSpots()) return
    if (kind === 'school') spawnSchoolTrip(this)
    else spawnCritic(this)
  }
  /** Each new day has a small chance of a school trip, and a smaller one of a critic. Both need a decent zoo. */
  private rollEvents() {
    this.events = []
    if (this.day >= 3 && this.animals.length >= 2 && this.rating >= 30 && Math.random() < 0.12)
      this.events.push({ kind: 'school', at: 0.06 + Math.random() * 0.2 })
    if (this.day >= 5 && this.totalVisitors >= 20 && this.animals.length >= 4 && Math.random() < 0.07)
      this.events.push({ kind: 'critic', at: 0.06 + Math.random() * 0.25 })
  }

  // ---- simulation ----
  update(dt: number) {
    this.time += dt / DAY_LENGTH
    if (this.time >= 1) {
      this.time -= 1
      this.endDay()
    }
    for (const e of [...this.events])
      if (this.time >= e.at) {
        this.events.splice(this.events.indexOf(e), 1)
        this.startEvent(e.kind)
      }
    for (const a of this.animals) updateAnimal(this, a, dt)
    for (const k of this.keepers) updateKeeper(this, k, dt)
    updateVisitors(this, dt)
    resolveCollisions(this)
    if ((this.goalTimer -= dt) <= 0) {
      this.goalTimer = 1
      this.checkGoals()
    }
  }

  private endDay() {
    this.day++
    this.rollEvents()
    const wages = this.keepers.length * KEEPER_WAGE
    if (wages) {
      this.money -= wages
      this.onMessage(`Day ${this.day}: paid keepers $${wages}`)
    }
  }

  addReview(v: Visitor, r: Review) {
    this.reviews.push(r)
    if (this.reviews.length > 40) this.reviews.shift()
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
        animals: this.animals.map((a) => ({
          s: a.species.id,
          x: a.tx,
          y: a.ty,
          h: a.hunger,
          n: a.name,
          d: a.arrived,
        })),
        keepers: this.keepers.length,
        gates: [...this.gates],
        props: [...this.props.values()].map((p) => ({ id: p.id, x: p.x, y: p.y })),
        goal: this.goalIndex,
        guests: this.totalVisitors,
        mood: this.guestMood,
        name: this.zooName,
        prices: [this.ticketPrice, this.foodPrice, this.giftPrice],
        reviews: this.reviews,
      }),
    )
  }
  load() {
    const raw = localStorage.getItem('zoo-save')
    if (!raw) return false
    try {
      const d = JSON.parse(raw)
      this.tiles.set(d.tiles)
      this.regionCache.clear()
      for (const i of d.gates ?? []) this.gates.add(i)
      this.ensureFixedTiles()
      this.money = d.money
      this.day = d.day
      this.time = d.time
      this.goalIndex = d.goal ?? 0
      this.totalVisitors = d.guests ?? 0
      this.guestMood = d.mood ?? 70
      this.reviews = d.reviews ?? []
      this.zooName = d.name ?? this.zooName
      if (d.prices) [this.ticketPrice, this.foodPrice, this.giftPrice] = d.prices
      for (const p of d.props ?? []) this.addProp(p.id, p.x, p.y)
      this.orientProps()
      if (!d.gates) this.autoGates() // old saves predate gates
      for (const a of d.animals) {
        const sp = SPECIES.find((s) => s.id === a.s)
        if (!sp) continue
        const an = new Animal(sp, a.x, a.y)
        an.hunger = a.h
        if (a.n) an.name = a.n
        an.arrived = a.d ?? this.day
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
  /**
   * Give every enclosure that has no gate one, on the tile whose neighboring path is closest to the entrance.
   * Runs after paths or enclosures change, so gates appear wherever a pen meets a path.
   */
  autoGates() {
    const b = this.bfs(ENTRANCE.x, ENTRANCE.y)
    const done = new Set<number>()
    let added = false
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (this.tile(x, y) !== T_PEN || done.has(idx(x, y))) continue
        const reg = this.region(x, y)
        for (const [rx, ry] of reg) done.add(idx(rx, ry))
        // a gate whose path was removed is dead weight: drop it so a new one can be placed
        for (const [rx, ry] of reg)
          if (this.gates.has(idx(rx, ry)) && !DIRS.some(([dx, dy]) => this.tile(rx + dx, ry + dy) === T_PATH))
            this.gates.delete(idx(rx, ry))
        if (this.hasGate(reg)) continue
        let best: number | null = null
        let bestD = Infinity
        for (const [rx, ry] of reg)
          for (const [dx, dy] of DIRS) {
            if (this.tile(rx + dx, ry + dy) !== T_PATH) continue
            const d = reachable(b, rx + dx, ry + dy) ? b.dist[idx(rx + dx, ry + dy)] : 1e6
            if (d < bestD) {
              bestD = d
              best = idx(rx, ry)
            }
          }
        if (best !== null) {
          this.gates.add(best)
          added = true
        }
      }
    if (added) this.onTilesChanged()
  }
  reset() {
    this.resetting = true // stops the unload autosave from re-creating the save
    localStorage.removeItem('zoo-save')
    location.reload()
  }
}
