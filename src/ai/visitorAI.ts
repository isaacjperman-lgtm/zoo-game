import type { Game } from '../game'
import { Visitor } from '../entities/people'
import { ADMISSION, DESK, ENTRANCE, N, T_PATH, toWorld } from '../config'
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
  switch (v.state) {
    case 'queue': {
      const slot = g.queue.indexOf(v)
      const arrived = v.moveTo(toWorld(DESK.x) + v.lane, toWorld(DESK.y) + slot * QUEUE_SPACING, dt)
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
        g.money += ADMISSION
        g.totalVisitors++
        v.satisfaction -= Math.max(0, v.waited - 10) / 5 // long waits annoy people
        g.queue.splice(g.queue.indexOf(v), 1)
        planNext(g, v)
      }
      break
    case 'walking':
      if (v.step(dt)) {
        v.state = 'watching'
        v.timer = 3.5 + Math.random() * 4 + (v.focus?.species.id === v.favorite ? 3 : 0)
      }
      break
    case 'watching': {
      const a = v.focus
      if (a) v.face(a.group.position.x, a.group.position.z)
      if ((v.timer -= dt) > 0) break
      if (a && g.animals.includes(a)) {
        const joy = a.happiness * (a.status === 'sleeping' ? 0.5 : 1)
        v.satisfaction += (joy - 50) / 8 + (a.species.id === v.favorite ? 4 : 0)
        g.money += Math.round(joy / 25) // donations and snacks
        v.visited.add(a)
      }
      if (--v.stops > 0 && g.isDay) planNext(g, v)
      else leave(g, v)
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
  const b = g.bfs(v.px, v.py)
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
  if (!best) return leave(g, v)
  v.focus = best.a
  v.path = g.pathTo(b, best.x, best.y)
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
