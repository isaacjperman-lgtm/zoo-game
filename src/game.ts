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
  KEEPER_UPGRADES,
  type UpgradeKind,
  type Duty,
  KEEPER_COST,
  DAY_LENGTH,
  PRICE_LIMITS,
  type PriceKind,
  ADULT_AGE,
  BREEDING,
  SICKNESS,
  TREAT_COST,
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
import { updateVisitors, spawnSchoolTrip, spawnCritic, inviteToShow } from './ai/visitorAI'
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
  /** What the player charges for each thing, edited in the Prices panel. */
  price: Record<PriceKind, number> = {
    ticket: PRICE_LIMITS.ticket.def,
    food: PRICE_LIMITS.food.def,
    gift: PRICE_LIMITS.gift.def,
    icecream: PRICE_LIMITS.icecream.def,
    show: PRICE_LIMITS.show.def,
  }
  get ticketPrice() {
    return this.price.ticket
  }
  get foodPrice() {
    return this.price.food
  }
  get giftPrice() {
    return this.price.gift
  }
  get iceCreamPrice() {
    return this.price.icecream
  }
  get showPrice() {
    return this.price.show
  }
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
  babiesBorn = 0
  showsHeld = 0
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
    return {
      ticket: 5 + r * 0.2,
      food: 6 + r * 0.05,
      gift: 8 + r * 0.14,
      icecream: 3 + r * 0.04,
      show: 4 + r * 0.07,
    }
  }
  /** 0.3..1.4: how many guests turn up relative to normal at the current ticket price. */
  get demand() {
    return Math.min(1.4, Math.max(0.3, this.fair.ticket / Math.max(1, this.ticketPrice)))
  }

  setPrice(kind: PriceKind, v: number) {
    const lim = PRICE_LIMITS[kind]
    this.price[kind] = Math.min(lim.max, Math.max(lim.min, Math.round(v)))
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
    this.entranceBfs = null
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

  get hasClinic() {
    return this.countProps('vet') > 0
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
    this.stats.todayIncome += amount
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
      this.money += this.sellValue(a)
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

  /** Bought animals fetch half their price; bred ones only 15%, so breeding can't be farmed for cash. */
  sellValue(a: Animal) {
    return Math.floor(a.species.cost * (a.bred ? BREEDING.bredResale : 0.5))
  }
  /** A keeper (or the player, from the animal card) gives a sick animal medicine. Needs a vet clinic. */
  treat(a: Animal, byPlayer = false) {
    if (!a.sick) return
    if (!this.hasClinic) return byPlayer ? this.onMessage('Build a vet clinic first.') : undefined
    if (this.money < TREAT_COST) return byPlayer ? this.onMessage('Not enough money!') : undefined
    this.money -= TREAT_COST
    a.sick = false
    a.immuneT = SICKNESS.immunity
    this.onSound('hire')
    if (byPlayer) this.onMessage(`${a.name} is feeling better`)
  }
  /** Sell an animal at its sale value. */
  sellAnimal(a: Animal) {
    const i = this.animals.indexOf(a)
    if (i < 0) return
    this.animals.splice(i, 1)
    this.root.remove(a.group)
    const value = this.sellValue(a)
    this.money += value
    this.onSound('build')
    this.onMessage(`Sold ${a.name} for $${value}`)
  }

  /** Price of the next level of an upgrade, or null when the keeper has it maxed. */
  /** When a feeding keeper is idle although animals need care, say why (shown on the keeper card). */
  idleReason(k: Keeper): string | null {
    if (k.phase !== 'idle' || k.duty !== 'feed') return null
    const needy = this.animals.filter((a) => a.hunger > k.feedAt || (a.sick && this.hasClinic))
    if (!needy.length) return null
    if (needy.every((a) => this.money < a.species.feedCost)) return 'Not enough money to buy food'
    if (this.tile(k.px, k.py) !== T_PATH) return "Isn't standing on a path"
    const b = this.bfs(k.px, k.py)
    if (needy.every((a) => !this.gateSpotsFor(a, b).length))
      return "Can't reach the hungry animals. Link paths from the entrance to their pens"
    return null
  }
  upgradeCost(k: Keeper, kind: UpgradeKind) {
    const u = KEEPER_UPGRADES[kind]
    return k.levels[kind] >= u.max ? null : u.cost * (k.levels[kind] + 1)
  }
  setDuty(k: Keeper, duty: Duty) {
    k.duty = duty
    this.onSound('hire')
    this.onMessage(
      duty === 'breed' ? `${k.name} is now on Breeding duty.` : `${k.name} is back to feeding animals.`,
    )
  }
  upgradeKeeper(k: Keeper, kind: UpgradeKind) {
    const cost = this.upgradeCost(k, kind)
    if (cost === null) return
    if (this.money < cost) return this.onMessage('Not enough money!')
    this.money -= cost
    k.levels[kind]++
    k.applyUpgrades()
    this.onSound('hire')
    this.onMessage(`${k.name} learned ${KEEPER_UPGRADES[kind].name.toLowerCase()}`)
  }
  dismissKeeper(k: Keeper) {
    const i = this.keepers.indexOf(k)
    if (i < 0) return
    this.keepers.splice(i, 1)
    this.root.remove(k.group)
    this.onMessage(`${k.name} has left the zoo`)
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

  // ---- breeding ----
  breedFee(a: Animal) {
    return Math.max(BREEDING.minFee, Math.round(a.species.cost * BREEDING.feeRate))
  }
  /** Bigger animals carry longer. In seconds of game time. */
  gestationTime(a: Animal) {
    return Math.round(40 + a.species.size * 80)
  }
  private penMates(a: Animal) {
    const reg = this.region(a.tx, a.ty)
    return {
      reg,
      group: this.animals.filter(
        (o) => o.species === a.species && reg.some((r) => r[0] === o.tx && r[1] === o.ty),
      ),
    }
  }
  private fitToBreed(o: Animal) {
    return (
      !o.isBaby &&
      !o.sick &&
      o.pregnantT <= 0 &&
      o.happiness >= BREEDING.minHappiness &&
      o.hunger <= BREEDING.maxHunger
    )
  }
  /** Another healthy, happy adult of the same species in the same pen. */
  breedPartner(a: Animal) {
    return this.penMates(a).group.find((o) => o !== a && this.fitToBreed(o)) ?? null
  }
  /** Why this animal can't be ordered to breed right now, or null when it can. */
  breedBlocker(a: Animal): string | null {
    if (a.pregnantT > 0) return 'Expecting a baby'
    if (a.isBaby) return 'Too young to breed'
    if (a.sick) return 'Too sick to breed'
    if (a.breedCool > 0) return `Resting for ${Math.ceil((a.breedCool / 150) * 10) / 10} more days`
    if (a.hunger > BREEDING.maxHunger) return 'Too hungry to breed'
    if (a.happiness < BREEDING.minHappiness) return 'Too unhappy to breed'
    const { reg, group } = this.penMates(a)
    if (!this.breedPartner(a))
      return `Needs another healthy, happy adult ${a.species.name.toLowerCase()} in its pen`
    if (reg.length / ((group.length + 1) * a.species.space) < 1)
      return 'The pen has no room for another animal'
    return null
  }
  get hasBreeder() {
    return this.keepers.some((k) => k.duty === 'breed')
  }
  /** The player orders a pair to breed; a keeper on Breeding duty will carry it out (and charge the fee then). */
  orderBreeding(a: Animal) {
    const why = this.breedBlocker(a)
    if (why) return this.onMessage(why + '.')
    if (this.money < this.breedFee(a)) return this.onMessage('Not enough money!')
    a.breedOrder = true
    this.onSound('build')
    this.onMessage(
      this.hasBreeder
        ? `${a.name} will be paired up by a keeper.`
        : 'Ordered, but no keeper is on Breeding duty yet. Right-click a keeper to set it.',
    )
  }
  cancelBreeding(a: Animal) {
    a.breedOrder = false
  }
  /** Called by the keeper when they reach the pair: re-check everything, take the fee, start the pregnancy. */
  completeBreeding(k: Keeper, a: Animal) {
    a.breedOrder = false
    const why = this.breedBlocker(a)
    if (why) return this.onMessage(`${k.name} couldn't breed ${a.name}: ${why.toLowerCase()}.`)
    const fee = this.breedFee(a)
    if (this.money < fee) return this.onMessage('Not enough money to breed!')
    this.money -= fee
    const partner = this.breedPartner(a)!
    a.pregnantT = this.gestationTime(a)
    partner.breedCool = BREEDING.partnerRest
    k.bred++
    this.onSound('hire')
    this.onMessage(`${a.name} is expecting! The baby is due soon.`)
  }
  private updateBreeding(dt: number) {
    for (const a of [...this.animals]) {
      if (a.pregnantT > 0) {
        if ((a.pregnantT -= dt) <= 0) {
          a.pregnantT = 0
          a.breedCool = BREEDING.restAfterBirth
          this.birth(a)
        }
      } else if (a.breedCool > 0) a.breedCool = Math.max(0, a.breedCool - dt)
    }
  }
  birth(parent: Animal) {
    const baby = new Animal(parent.species, parent.tx, parent.ty)
    baby.age = 0
    baby.bred = true
    baby.hunger = 10
    baby.arrived = this.day
    baby.group.position.copy(parent.group.position)
    baby.group.scale.setScalar(baby.growth)
    this.animals.push(baby)
    this.root.add(baby.group)
    this.babiesBorn++
    this.onSound('goal')
    this.onMessage(`A baby ${parent.species.name.toLowerCase()} was born! Right-click it to give it a name.`)
    return baby
  }

  // ---- shows ----
  /** Seconds left of the current show. Guests who hear about it head to a Show Stage. */
  showActive = 0
  private showQueue: number[] = [0.1, 0.3].filter((t) => t > this.time)
  startShow() {
    if (!this.countProps('arena') || !this.animals.length || !this.visitors.length) return
    this.showActive = 40
    this.showsHeld++
    this.onMessage('The show is about to begin!')
    for (const v of this.visitors) if (Math.random() < 0.75) inviteToShow(this, v)
  }

  // ---- statistics ----
  /** History for the Stats screen: funds and rating sampled through the day, plus one record per finished day. */
  stats: {
    samples: { t: number; money: number; rating: number }[]
    days: { day: number; guests: number; income: number; money: number; rating: number }[]
    todayGuests: number
    todayIncome: number
  } = { samples: [], days: [], todayGuests: 0, todayIncome: 0 }
  private sampleT = 0
  private sample() {
    const s = this.stats.samples
    s.push({ t: this.day + this.time, money: Math.round(this.money), rating: Math.round(this.rating) })
    if (s.length > 320) s.shift() // about 40 days
  }
  private closeDayStats() {
    const st = this.stats
    st.days.push({
      day: this.day - 1,
      guests: st.todayGuests,
      income: Math.round(st.todayIncome),
      money: Math.round(this.money),
      rating: Math.round(this.rating),
    })
    if (st.days.length > 40) st.days.shift()
    st.todayGuests = 0
    st.todayIncome = 0
  }

  // ---- weather ----
  weather: 'sunny' | 'cloudy' | 'rain' = 'sunny'
  private weatherT = 70
  /** Rain keeps guests away, sunshine brings them out. */
  get weatherDemand() {
    return this.weather === 'rain' ? 0.55 : this.weather === 'sunny' ? 1.12 : 0.95
  }
  private updateWeather(dt: number) {
    if ((this.weatherT -= dt) > 0) return
    this.weatherT = 40 + Math.random() * 50
    const r = Math.random()
    const was = this.weather
    this.weather =
      was === 'sunny'
        ? r < 0.55
          ? 'sunny'
          : 'cloudy'
        : was === 'cloudy'
          ? r < 0.35
            ? 'sunny'
            : r < 0.7
              ? 'cloudy'
              : 'rain'
          : r < 0.5
            ? 'cloudy'
            : r < 0.8
              ? 'rain'
              : 'sunny'
    if (this.weather === 'rain' && was !== 'rain')
      this.onMessage("It's started to rain. Expect fewer guests.")
    else if (was === 'rain' && this.weather !== 'rain') this.onMessage('The rain has stopped.')
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
    this.updateWeather(dt)
    if (this.showActive > 0) this.showActive -= dt
    if (this.showQueue.length && this.time >= this.showQueue[0]) {
      this.showQueue.shift()
      this.startShow()
    }
    this.updateBreeding(dt)
    if ((this.sampleT -= dt) <= 0) {
      this.sampleT = DAY_LENGTH / 8
      this.sample()
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
    this.showQueue = [0.1, 0.3]
    this.rollEvents()
    this.closeDayStats()
    const wages = this.keepers.reduce((s, k) => s + k.wage, 0)
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
          ag: a.age,
          sk: a.sick,
          sc: a.sickCause,
          br: a.bred,
          pg: a.pregnantT,
          bc: a.breedCool,
          bo: a.breedOrder,
          n: a.name,
          d: a.arrived,
        })),
        keepers: this.keepers.map((k) => ({ n: k.name, l: k.levels, f: k.fed, d: k.duty, b: k.bred })),
        stats: this.stats,
        gates: [...this.gates],
        props: [...this.props.values()].map((p) => ({ id: p.id, x: p.x, y: p.y })),
        goal: this.goalIndex,
        guests: this.totalVisitors,
        mood: this.guestMood,
        babies: this.babiesBorn,
        shows: this.showsHeld,
        name: this.zooName,
        price: this.price,
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
      this.entranceBfs = null
      for (const i of d.gates ?? []) this.gates.add(i)
      this.ensureFixedTiles()
      this.money = d.money
      this.day = d.day
      this.time = d.time
      this.goalIndex = d.goal ?? 0
      this.totalVisitors = d.guests ?? 0
      this.guestMood = d.mood ?? 70
      this.babiesBorn = d.babies ?? 0
      this.showsHeld = d.shows ?? 0
      this.reviews = d.reviews ?? []
      this.zooName = d.name ?? this.zooName
      if (d.price) Object.assign(this.price, d.price)
      else if (d.prices) [this.price.ticket, this.price.food, this.price.gift] = d.prices // older saves
      for (const p of d.props ?? []) this.addProp(p.id, p.x, p.y)
      this.orientProps()
      this.autoGates() // old saves predate gates, and some have gates that keepers can no longer reach
      for (const a of d.animals) {
        const sp = SPECIES.find((s) => s.id === a.s)
        if (!sp) continue
        const an = new Animal(sp, a.x, a.y)
        an.hunger = a.h
        an.age = a.ag ?? ADULT_AGE
        an.sick = !!a.sk
        an.sickCause = a.sc ?? 'bad luck'
        an.bred = !!a.br
        an.pregnantT = a.pg ?? 0
        an.breedCool = a.bc ?? 0
        an.breedOrder = !!a.bo
        if (a.n) an.name = a.n
        an.arrived = a.d ?? this.day
        this.animals.push(an)
        this.root.add(an.group)
      }
      if (d.stats) this.stats = d.stats
      // older saves stored just a keeper count
      const saved: { n?: string; l?: Keeper['levels']; f?: number; d?: Duty; b?: number }[] =
        typeof d.keepers === 'number' ? Array.from({ length: d.keepers }, () => ({})) : d.keepers
      for (const s of saved) {
        const k = new Keeper()
        if (s.n) k.name = s.n
        if (s.l) k.levels = { speed: s.l.speed ?? 0, skill: s.l.skill ?? 0 }
        k.fed = s.f ?? 0
        k.duty = s.d ?? 'feed'
        k.bred = s.b ?? 0
        k.applyUpgrades()
        this.keepers.push(k)
        this.root.add(k.group)
      }
      return true
    } catch {
      return false
    }
  }
  /**
   * Keep every enclosure's gate where keepers can actually use it: on a tile whose neighboring path is linked to the
   * entrance, as close to it as possible. Runs after paths or enclosures change (and when a save loads), so a gate
   * placed beside a path that was not yet connected moves as soon as a better connection exists.
   */
  autoGates() {
    const b = this.entranceReach()
    const done = new Set<number>()
    let changed = false
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (this.tile(x, y) !== T_PEN || done.has(idx(x, y))) continue
        const reg = this.region(x, y)
        for (const [rx, ry] of reg) done.add(idx(rx, ry))
        const pathsNext = (rx: number, ry: number) =>
          DIRS.filter(([dx, dy]) => this.tile(rx + dx, ry + dy) === T_PATH).map(([dx, dy]) => [
            rx + dx,
            ry + dy,
          ])
        // a gate whose path was removed is dead weight
        for (const [rx, ry] of reg)
          if (this.gates.has(idx(rx, ry)) && !pathsNext(rx, ry).length) {
            this.gates.delete(idx(rx, ry))
            changed = true
          }
        if (this.gateReachable(reg)) continue // already usable
        // best tile whose neighboring path is linked to the entrance, nearest first
        let best: number | null = null
        let bestD = Infinity
        for (const [rx, ry] of reg)
          for (const [px, py] of pathsNext(rx, ry))
            if (reachable(b, px, py) && b.dist[idx(px, py)] < bestD) {
              bestD = b.dist[idx(px, py)]
              best = idx(rx, ry)
            }
        if (best === null && !this.hasGate(reg)) {
          // nothing is linked yet: still give the pen a gate beside some path, so it works once linked
          for (const [rx, ry] of reg) if (best === null && pathsNext(rx, ry).length) best = idx(rx, ry)
        }
        if (best !== null) {
          if (this.hasGate(reg) && bestD < Infinity)
            for (const [rx, ry] of reg) this.gates.delete(idx(rx, ry)) // replace the unusable one
          this.gates.add(best)
          changed = true
        }
      }
    if (changed) this.onTilesChanged()
  }
  /** Distances along paths from the entrance, cached until the tiles change. */
  private entranceBfs: Bfs | null = null
  entranceReach() {
    return (this.entranceBfs ??= this.bfs(ENTRANCE.x, ENTRANCE.y))
  }
  /** True if some gate of this pen has a path next to it that is linked to the entrance. */
  gateReachable(reg: number[][]) {
    const b = this.entranceReach()
    return reg.some(
      ([rx, ry]) =>
        this.gates.has(idx(rx, ry)) &&
        DIRS.some(([dx, dy]) => this.tile(rx + dx, ry + dy) === T_PATH && reachable(b, rx + dx, ry + dy)),
    )
  }
  reset() {
    this.resetting = true // stops the unload autosave from re-creating the save
    localStorage.removeItem('zoo-save')
    location.reload()
  }
}
