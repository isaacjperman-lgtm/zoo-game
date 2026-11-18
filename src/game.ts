import * as THREE from 'three'
import { SPECIES } from './data/species'
import {
  N,
  T_PATH,
  T_PEN,
  ENTRANCE,
  ADMISSION,
  KEEPER_WAGE,
  KEEPER_COST,
  DAY_LENGTH,
  COSTS,
  idx,
  inBounds,
  toWorld,
  toTile,
  DIRS,
} from './config'
import { Animal } from './entities/animal'
import { Visitor, Keeper } from './entities/people'
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
  spawnTimer = 3
  totalVisitors = 0
  message = ''
  onTilesChanged = () => {}
  onMessage = (_m: string) => {}

  constructor() {
    this.tiles[idx(ENTRANCE.x, ENTRANCE.y)] = T_PATH
  }

  get isDay() {
    return Math.sin(this.time * Math.PI * 2) > -0.05
  }
  get rating() {
    if (!this.animals.length) return 0
    return this.animals.reduce((a, b) => a + b.happiness, 0) / this.animals.length
  }

  tile(x: number, y: number) {
    return inBounds(x, y) ? this.tiles[idx(x, y)] : -1
  }

  // ---- building ----
  paint(x: number, y: number, type: number) {
    if (!inBounds(x, y) || (x === ENTRANCE.x && y === ENTRANCE.y)) return
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
  }

  // ---- pathfinding over path tiles (BFS) ----
  private bfsParents(sx: number, sy: number) {
    const parent = new Int32Array(N * N).fill(-2)
    parent[idx(sx, sy)] = -1
    const q = [idx(sx, sy)]
    for (let h = 0; h < q.length; h++) {
      const c = q[h],
        cx = c % N,
        cy = (c / N) | 0
      for (const [dx, dy] of DIRS) {
        const nx = cx + dx,
          ny = cy + dy
        if (this.tile(nx, ny) === T_PATH && parent[idx(nx, ny)] === -2) {
          parent[idx(nx, ny)] = c
          q.push(idx(nx, ny))
        }
      }
    }
    return parent
  }
  private pathTo(parent: Int32Array, gx: number, gy: number) {
    const out: { x: number; y: number }[] = []
    for (let c = idx(gx, gy); c >= 0 && parent[c] !== -2; c = parent[c]) {
      out.push({ x: c % N, y: (c / N) | 0 })
    }
    return out.reverse().slice(1)
  }
  /** path tiles next to an occupied pen, reachable from the entrance */
  viewingSpots() {
    const parent = this.bfsParents(ENTRANCE.x, ENTRANCE.y)
    const spots = new Set<number>()
    for (const a of this.animals)
      for (const [rx, ry] of this.region(a.tx, a.ty))
        for (const [dx, dy] of DIRS) {
          const i = idx(rx + dx, ry + dy)
          if (this.tile(rx + dx, ry + dy) === T_PATH && parent[i] !== -2) spots.add(i)
        }
    return [...spots]
  }

  // ---- simulation ----
  update(dt: number) {
    this.time += dt / DAY_LENGTH
    if (this.time >= 1) {
      this.time -= 1
      this.endDay()
    }
    this.updateAnimals(dt)
    this.updateKeepers(dt)
    this.updateVisitors(dt)
  }

  private endDay() {
    this.day++
    const wages = this.keepers.length * KEEPER_WAGE
    if (wages) {
      this.money -= wages
      this.onMessage(`Day ${this.day}: paid keepers $${wages}`)
    }
  }

  private updateAnimals(dt: number) {
    for (const a of this.animals) {
      a.hunger = Math.min(100, a.hunger + a.species.hungerRate * dt)
      const reg = this.region(a.tx, a.ty)
      const crowd = this.animals.filter(
        (o) =>
          o.species === a.species &&
          this.tile(o.tx, o.ty) === T_PEN &&
          reg.some((r) => r[0] === o.tx && r[1] === o.ty),
      ).length
      const room = reg.length / (crowd * a.species.space)
      a.happiness = Math.max(0, Math.min(100, 100 - a.hunger * 0.7 - (room < 1 ? (1 - room) * 40 : 0)))
      // wander within the pen
      if (a.target) {
        const p = a.group.position,
          d = a.target.clone().sub(p)
        d.y = 0
        const sp = 0.6 * dt
        if (d.length() < sp) {
          p.x = a.target.x
          p.z = a.target.z
          a.target = null
          a.wait = 1 + Math.random() * 4
        } else {
          d.normalize()
          p.x += d.x * sp
          p.z += d.z * sp
          a.group.rotation.y = Math.atan2(d.x, d.z)
        }
        a.tx = toTile(p.x)
        a.ty = toTile(p.z)
      } else if ((a.wait -= dt) <= 0) {
        const r = reg[(Math.random() * reg.length) | 0]
        if (r)
          a.target = new THREE.Vector3(
            toWorld(r[0]) + (Math.random() - 0.5) * 0.5,
            0.05,
            toWorld(r[1]) + (Math.random() - 0.5) * 0.5,
          )
        else a.wait = 1
      }
    }
  }

  private updateKeepers(dt: number) {
    for (const k of this.keepers) {
      if (k.target && !this.animals.includes(k.target)) k.target = null
      if (!k.target) {
        const taken = new Set(this.keepers.map((o) => o.target))
        const hungry = this.animals
          .filter((a) => a.hunger > 40 && !taken.has(a))
          .sort((a, b) => b.hunger - a.hunger)[0]
        if (hungry) k.target = hungry
      }
      if (k.target) {
        const p = k.group.position,
          t = k.target.group.position
        const dx = t.x - p.x,
          dz = t.z - p.z,
          d = Math.hypot(dx, dz)
        if (d < 0.6) {
          if (this.money >= k.target.species.feedCost) this.feed(k.target)
          k.target = null
        } else {
          const s = Math.min(d, k.speed * dt)
          p.x += (dx / d) * s
          p.z += (dz / d) * s
          k.group.rotation.y = Math.atan2(dx, dz)
        }
      }
    }
  }

  private updateVisitors(dt: number) {
    this.spawnTimer -= dt
    if (this.spawnTimer <= 0 && this.isDay) {
      this.spawnTimer = Math.max(1.5, 12 - this.rating / 10)
      if (this.animals.length && this.viewingSpots().length) {
        this.money += ADMISSION
        this.totalVisitors++
        const v = new Visitor()
        this.visitors.push(v)
        this.root.add(v.group)
        this.nextStop(v)
      }
    }
    for (const v of [...this.visitors]) {
      if (v.state === 'watching') {
        if ((v.timer -= dt) <= 0) {
          const near = this.animals.filter((a) => Math.abs(a.tx - v.px) <= 3 && Math.abs(a.ty - v.py) <= 3)
          const joy = near.length ? near.reduce((s, a) => s + a.happiness, 0) / near.length : 0
          this.money += Math.round(joy / 20)
          if (--v.stops > 0 && this.isDay) this.nextStop(v)
          else this.sendHome(v)
        }
      } else if (v.step(dt)) {
        if (v.state === 'leaving') {
          this.root.remove(v.group)
          this.visitors.splice(this.visitors.indexOf(v), 1)
        } else {
          v.state = 'watching'
          v.timer = 4 + Math.random() * 5
        }
      }
    }
  }

  private nextStop(v: Visitor) {
    const spots = this.viewingSpots()
    if (!spots.length) return this.sendHome(v)
    const parent = this.bfsParents(v.px, v.py),
      s = spots[(Math.random() * spots.length) | 0]
    if (parent[s] === -2) return this.sendHome(v)
    v.path = this.pathTo(parent, s % N, (s / N) | 0)
    v.state = 'walking'
  }
  private sendHome(v: Visitor) {
    const parent = this.bfsParents(v.px, v.py)
    v.path = parent[idx(ENTRANCE.x, ENTRANCE.y)] === -2 ? [] : this.pathTo(parent, ENTRANCE.x, ENTRANCE.y)
    v.state = 'leaving'
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
