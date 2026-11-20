import type { Game } from '../game'
import { Visitor } from '../entities/people'
import { DESK, ENTRANCE, N, T_PATH, toWorld } from '../config'
import { reachable } from '../world/pathfinding'
import { writeReview } from './reviews'

const QUEUE_SPACING = 0.55

/**
 * Guest journey: arrive -> queue at the ticket booth -> register and pay -> tour enclosures
 * (favorite species first, new animals preferred, happy animals preferred) -> leave.
 * Satisfaction rises and falls with what they see and wait through, and feeds the zoo rating.
 */
export function updateVisitors(g: Game, dt: number) {
  g.spawnTimer -= dt
  if (g.spawnTimer <= 0 && g.isDay) {
    g.spawnTimer = Math.max(2, 14 - g.rating / 9) / (g.demand * g.weatherDemand) // dearer tickets and rain mean fewer guests
    if (g.animals.length && g.hasViewingSpots()) {
      const v = new Visitor()
      g.visitors.push(v)
      g.queue.push(v)
      g.root.add(v.group)
    }
  }
  for (const v of [...g.visitors]) updateVisitor(g, v, dt)
}

function updateVisitor(g: Game, v: Visitor, dt: number) {
  v.moving = false
  v.speedMul = g.weather === 'rain' ? 1.25 : 1
  if (v.state !== 'queue' && v.state !== 'register' && v.state !== 'leaving') {
    v.food += 2 * dt * (g.weather === 'sunny' ? 1.5 : 1) // hot days make people hungry
    v.bladder += 2 * dt
    v.treat += dt * (g.weather === 'sunny' ? 2.4 : g.weather === 'cloudy' ? 1 : 0.2)
  }
  switch (v.state) {
    case 'queue': {
      const slot = g.queue.indexOf(v)
      const tx = toWorld(DESK.x) + v.lane
      const tz = toWorld(DESK.y) + slot * QUEUE_SPACING
      // close enough counts: other guests may nudge them off the exact spot
      const arrived =
        v.moveTo(tx, tz, dt) || Math.hypot(v.group.position.x - tx, v.group.position.z - tz) < 0.12
      v.waited += dt
      if (slot > 0 || !arrived) {
        if ((v.patience -= dt) <= 0) {
          v.satisfaction = 15
          g.queue.splice(slot, 1)
          v.state = 'leaving'
          v.path = [{ x: ENTRANCE.x, y: N + 9 }]
          if (v.kind !== 'child')
            g.addReview(v, {
              ...writeReview(g, v),
              text: 'Gave up waiting for a ticket',
              tags: ['Long entrance queue'],
            })
        }
      } else {
        // the ticket is paid for the moment they reach the booth, not when they leave
        g.earn(Math.round(g.ticketPrice * v.ticketFactor), v.group.position.x, v.group.position.z)
        g.totalVisitors++
        g.stats.todayGuests++
        if (g.weather === 'rain') {
          v.rained = true
          v.stops = Math.max(1, v.stops - 1) // they cut the visit short
        }
        if (v.priceSensitive) judgePrice(v, g.ticketPrice, g.fair.ticket, 'Overpriced tickets', 25, 0.6)
        if (v.kind === 'teacher') {
          const kids = (v.party?.length ?? 1) - 1
          g.earn(30 + kids * 8, v.group.position.x, v.group.position.z) // the school's donation
        }
        v.state = 'register'
        v.timer = 2 + Math.random() * 1.5
        v.face(toWorld(DESK.x) + 1, toWorld(DESK.y)) // clerk is in the booth to the east
      }
      break
    }
    case 'register':
      if ((v.timer -= dt) <= 0) {
        v.satisfaction -= Math.max(0, v.waited - 10) / 5 // long waits annoy people
        g.queue.splice(g.queue.indexOf(v), 1)
        planNext(g, v)
      }
      break
    case 'walking':
      if (v.step(dt)) {
        if (v.errand) {
          v.state = 'using'
          v.timer = (v.errand.id === 'arena' ? 6 : 2.5) + Math.random() // a show takes a little longer
          v.face(v.errand.group.position.x, v.errand.group.position.z)
        } else {
          v.state = 'watching'
          v.timer = 3.5 + Math.random() * 4 + (v.focus?.species.id === v.favorite ? 3 : 0)
        }
      }
      break
    case 'using':
      if ((v.timer -= dt) <= 0) finishErrand(g, v)
      break
    case 'watching': {
      const a = v.focus
      if (a) v.face(a.group.position.x, a.group.position.z)
      if ((v.timer -= dt) > 0) break
      if (a && g.animals.includes(a)) {
        const joy = a.happiness * (a.status === 'sleeping' ? 0.5 : 1)
        const bar = v.kind === 'critic' ? 65 : 50 // critics are harder to please
        const gain = (joy - bar) / 8
        v.satisfaction +=
          (v.kind === 'child' && gain > 0 ? gain * 1.5 : gain) + (a.species.id === v.favorite ? 4 : 0)
        const deco = g.decorNear(v.px, v.py)
        v.satisfaction += Math.min(4, deco) // pleasant scenery
        v.scenery += Math.min(4, deco)
        if (joy < 40) v.sawSad++
        else if (joy >= 75) v.sawHappy++
        if (a.isBaby) {
          v.sawBaby++
          v.satisfaction += 3 // babies are adorable
        }
        if (a.sick) {
          v.sawSick++
          v.satisfaction -= 3
        }
        g.earn(Math.round(joy / 25), v.group.position.x, v.group.position.z) // donations
        v.visited.add(a)
      }
      if (--v.stops > 0 && g.isDay) planNext(g, v)
      else finishTour(g, v)
      break
    }
    case 'leaving':
      if (v.step(dt)) {
        g.root.remove(v.group)
        g.visitors.splice(g.visitors.indexOf(v), 1)
        const mood = Math.max(0, Math.min(100, v.satisfaction))
        g.recordGuestMood(mood)
        if (v.kind === 'critic') criticVerdict(g, mood)
      }
      break
  }
}

/** Choose the most appealing reachable animal and walk to a viewing spot beside its pen. */
function planNext(g: Game, v: Visitor) {
  v.state = 'walking'
  v.errand = null
  const b = g.bfs(v.px, v.py)

  // Basic needs come first.
  const need =
    v.food > 65
      ? 'food'
      : v.bladder > 60
        ? 'restroom'
        : v.treat > 60 && g.countProps('icecream')
          ? 'icecream'
          : null
  const dear =
    v.priceSensitive &&
    (need === 'food'
      ? g.foodPrice > g.fair.food * 1.6
      : need === 'icecream'
        ? g.iceCreamPrice > g.fair.icecream * 1.6
        : false)
  if (need && dear) {
    // they want it but won't pay these prices: grumble once and carry on touring
    const tag = need === 'food' ? 'Overpriced food' : 'Overpriced ice cream'
    v.gripes.add(tag)
    if (!v.complained.has(tag)) {
      v.complained.add(tag)
      v.satisfaction -= 8
    }
    if (need === 'food') v.food = 20
    else v.treat = 20
  } else if (need) {
    const s = g.nearestService(need, b)
    if (s) {
      v.errand = s.prop
      v.focus = null
      v.path = g.pathTo(b, s.spot.x, s.spot.y)
      return
    }
    if (!v.complained.has(need)) {
      v.complained.add(need) // nowhere to go: they remember that
      v.satisfaction -= 8
    }
  }

  // a show is on: most guests head for the stage
  if (
    g.showActive > 0 &&
    !v.sawShow &&
    (!v.priceSensitive || g.showPrice <= g.fair.show * 1.6) &&
    Math.random() < 0.8
  ) {
    const s = g.nearestService('arena', b)
    if (s) {
      v.errand = s.prop
      v.focus = null
      v.path = g.pathTo(b, s.spot.x, s.spot.y)
      return
    }
  }

  let best: { a: (typeof g.animals)[number]; x: number; y: number } | null = null
  let bestScore = -Infinity
  for (const a of g.animals) {
    const spots = g.spotsFor(a, b)
    if (!spots.length) continue
    spots.sort((p, q) => p.d - q.d)
    const score =
      (a.species.id === v.favorite ? 3 : 1) *
        (v.party && v.party[0] !== v && v.party[0].focus === a ? 3 : 1) * // kids follow their teacher
        (v.visited.has(a) ? 0.2 : 1) *
        (0.4 + a.happiness / 100) *
        (1 / (1 + spots[0].d * 0.04)) +
      Math.random() * 0.15
    if (score > bestScore) {
      best = { a, x: spots[0].x, y: spots[0].y }
      bestScore = score
    }
  }
  if (!best) return finishTour(g, v)
  v.focus = best.a
  v.path = g.pathTo(b, best.x, best.y)
}

/** A guest's reaction to a price: unhappy above what they think is fair, a little pleased below it. */
function judgePrice(v: Visitor, price: number, fair: number, tag: string, maxPenalty: number, k: number) {
  v.satisfaction += Math.min(6, Math.max(-maxPenalty, (fair - price) * k))
  if (price > fair * 1.4) v.gripes.add(tag)
  else if (price < fair * 0.75) v.valued = true
}

/** Apply the effect of the building a guest just finished using, then carry on. */
function finishErrand(g: Game, v: Visitor) {
  const p = v.errand
  v.errand = null
  const pos = v.group.position
  if (p?.id === 'food') {
    g.earn(g.foodPrice, pos.x, pos.z)
    v.ateFood = true
    v.food = 0
    v.satisfaction += 8
    if (v.priceSensitive) judgePrice(v, g.foodPrice, g.fair.food, 'Overpriced food', 6, 0.8)
  } else if (p?.id === 'icecream') {
    g.earn(g.iceCreamPrice, pos.x, pos.z)
    v.ateTreat = true
    v.treat = 0
    v.satisfaction += 6
    if (v.priceSensitive) judgePrice(v, g.iceCreamPrice, g.fair.icecream, 'Overpriced ice cream', 6, 0.8)
  } else if (p?.id === 'arena') {
    g.earn(g.showPrice, pos.x, pos.z)
    v.sawShow = true
    v.satisfaction += 9
    if (v.priceSensitive) judgePrice(v, g.showPrice, g.fair.show, 'Overpriced shows', 6, 0.8)
  } else if (p?.id === 'restroom') {
    v.bladder = 0
    v.satisfaction += 5
  } else if (p?.id === 'gift') {
    // happy guests buy souvenirs more readily; steep prices put people off
    const chance = !v.priceSensitive
      ? v.kind === 'child'
        ? 0.85
        : 0.5
      : Math.min(1, Math.max(0.2, v.satisfaction / 100 + 0.2)) *
        Math.min(1, (g.fair.gift / Math.max(1, g.giftPrice)) * 1.1)
    if (Math.random() < chance) {
      g.earn(g.giftPrice, pos.x, pos.z)
      v.satisfaction += 4
    } else if (v.priceSensitive && g.giftPrice > g.fair.gift * 1.4) v.gripes.add('Overpriced souvenirs')
    return leave(g, v)
  }
  if (v.stops > 0 && g.isDay) planNext(g, v)
  else finishTour(g, v)
}

/** Last stop before going home: browse the gift shop if there is one. */
function finishTour(g: Game, v: Visitor) {
  if (!v.shopped && v.satisfaction > 35 && g.tile(v.px, v.py) === T_PATH) {
    const s = g.nearestService('gift', g.bfs(v.px, v.py))
    if (s) {
      v.shopped = true
      v.state = 'walking'
      v.errand = s.prop
      v.focus = null
      v.path = g.pathTo(g.bfs(v.px, v.py), s.spot.x, s.spot.y)
      return
    }
  }
  leave(g, v)
}

function leave(g: Game, v: Visitor) {
  v.state = 'leaving'
  if (v.kind !== 'child') g.addReview(v, writeReview(g, v)) // the teacher speaks for the school trip
  v.focus = null
  v.path = []
  if (g.tile(v.px, v.py) === T_PATH) {
    const b = g.bfs(v.px, v.py)
    if (reachable(b, ENTRANCE.x, ENTRANCE.y)) {
      v.path = [...g.pathTo(b, ENTRANCE.x, ENTRANCE.y), { x: ENTRANCE.x, y: N + 9 }]
    }
  }
}

// ---- rare events ----

/** A teacher and 5-9 kids arrive together. Kids pay half price and love the animals; the school donates too. */
export function spawnSchoolTrip(g: Game) {
  const teacher = new Visitor('teacher')
  const party = [teacher]
  const kids = 5 + Math.floor(Math.random() * 5)
  for (let i = 0; i < kids; i++) party.push(new Visitor('child'))
  party.forEach((v, i) => {
    v.party = party
    v.group.position.z += i * 0.5 // arrive in a line
    g.visitors.push(v)
    g.queue.push(v)
    g.root.add(v.group)
  })
  g.onMessage(`A school trip of ${kids} kids has arrived!`)
}

/** A zoo critic tours the zoo. Their opinion counts three times toward guest mood and can earn a bonus. */
export function spawnCritic(g: Game) {
  const v = new Visitor('critic')
  g.visitors.push(v)
  g.queue.push(v)
  g.root.add(v.group)
  g.onMessage('A zoo critic has arrived. Impress them!')
}

function criticVerdict(g: Game, mood: number) {
  g.recordGuestMood(mood)
  g.recordGuestMood(mood)
  if (mood >= 70) {
    g.money += 250
    g.onMessage('The critic raved about your zoo! +$250')
  } else if (mood < 40) g.onMessage('The critic panned your zoo. Guests will hear about it.')
  else g.onMessage('The critic thought your zoo was just okay.')
}

/** A show has started: send this guest to the stage, unless they're busy, broke-minded or have seen it. */
export function inviteToShow(g: Game, v: Visitor) {
  if (v.sawShow || v.errand?.id === 'arena') return
  if (v.state !== 'walking' && v.state !== 'watching') return
  if (v.priceSensitive && g.showPrice > g.fair.show * 1.6) return
  if (g.tile(v.px, v.py) !== T_PATH) return
  const b = g.bfs(v.px, v.py)
  const s = g.nearestService('arena', b)
  if (!s) return
  v.errand = s.prop
  v.focus = null
  v.state = 'walking'
  v.path = g.pathTo(b, s.spot.x, s.spot.y)
}
