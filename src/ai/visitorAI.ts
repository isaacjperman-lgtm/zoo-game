import type { Game } from '../game'
import { Visitor } from '../entities/people'
import { ADMISSION, FOOD_PRICE, GIFT_PRICE, DESK, ENTRANCE, N, T_PATH, toWorld } from '../config'
import { reachable } from '../world/pathfinding'

const QUEUE_SPACING = 0.55

/**
 * Guest journey: arrive -> queue at the ticket booth -> register and pay -> tour enclosures
 * (favorite species first, new animals preferred, happy animals preferred) -> leave.
 * Satisfaction rises and falls with what they see and wait through, and feeds the zoo rating.
 */
export function updateVisitors(g: Game, dt: number) {
  g.spawnTimer -= dt
  if (g.spawnTimer <= 0 && g.isDay) {
    g.spawnTimer = Math.max(2, 14 - g.rating / 9)
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
  if (v.state !== 'queue' && v.state !== 'register' && v.state !== 'leaving') {
    v.food += 2 * dt
    v.bladder += 2 * dt
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
        }
      } else {
        v.state = 'register'
        v.timer = 2 + Math.random() * 1.5
        v.face(toWorld(DESK.x) + 1, toWorld(DESK.y)) // clerk is in the booth to the east
      }
      break
    }
    case 'register':
      if ((v.timer -= dt) <= 0) {
        g.earn(ADMISSION, v.group.position.x, v.group.position.z)
        g.totalVisitors++
        v.satisfaction -= Math.max(0, v.waited - 10) / 5 // long waits annoy people
        g.queue.splice(g.queue.indexOf(v), 1)
        planNext(g, v)
      }
      break
    case 'walking':
      if (v.step(dt)) {
        if (v.errand) {
          v.state = 'using'
          v.timer = 2.5 + Math.random()
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
        v.satisfaction += (joy - 50) / 8 + (a.species.id === v.favorite ? 4 : 0)
        v.satisfaction += Math.min(4, g.decorNear(v.px, v.py)) // pleasant scenery
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
        g.recordGuestMood(Math.max(0, Math.min(100, v.satisfaction)))
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
  const need = v.food > 65 ? 'food' : v.bladder > 60 ? 'restroom' : null
  if (need) {
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

  let best: { a: (typeof g.animals)[number]; x: number; y: number } | null = null
  let bestScore = -Infinity
  for (const a of g.animals) {
    const spots = g.spotsFor(a, b)
    if (!spots.length) continue
    spots.sort((p, q) => p.d - q.d)
    const score =
      (a.species.id === v.favorite ? 3 : 1) *
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

/** Apply the effect of the building a guest just finished using, then carry on. */
function finishErrand(g: Game, v: Visitor) {
  const p = v.errand
  v.errand = null
  const pos = v.group.position
  if (p?.id === 'food') {
    g.earn(FOOD_PRICE, pos.x, pos.z)
    v.food = 0
    v.satisfaction += 8
  } else if (p?.id === 'restroom') {
    v.bladder = 0
    v.satisfaction += 5
  } else if (p?.id === 'gift') {
    g.earn(Math.round(GIFT_PRICE * (0.5 + v.satisfaction / 100)), pos.x, pos.z)
    v.satisfaction += 4
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
  v.focus = null
  v.path = []
  if (g.tile(v.px, v.py) === T_PATH) {
    const b = g.bfs(v.px, v.py)
    if (reachable(b, ENTRANCE.x, ENTRANCE.y)) {
      v.path = [...g.pathTo(b, ENTRANCE.x, ENTRANCE.y), { x: ENTRANCE.x, y: N + 9 }]
    }
  }
}
