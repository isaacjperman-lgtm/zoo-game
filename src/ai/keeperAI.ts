import type { Game } from '../game'
import type { Keeper } from '../entities/people'
import { T_PATH, toWorld } from '../config'

/**
 * Keeper routine: pick the animal most worth feeding (hungry, and not too far away), walk the paths to
 * the nearest spot beside its pen, step in, feed it, step back out, and look for the next job.
 */
export function updateKeeper(g: Game, k: Keeper, dt: number) {
  k.moving = false
  if (k.target && !g.animals.includes(k.target)) {
    k.target = null
    k.phase = k.exit ? 'exit' : 'idle'
  }
  switch (k.phase) {
    case 'idle': {
      const job = pickJob(g, k)
      if (!job) return
      k.target = job
      plan(g, k)
      break
    }
    case 'walk':
      if (k.step(dt)) k.phase = 'enter'
      break
    case 'enter': {
      const t = k.target!.group.position
      const p = k.group.position
      if (Math.hypot(t.x - p.x, t.z - p.z) < 0.6) {
        k.face(t.x, t.z)
        k.phase = 'feed'
        k.timer = 1.4
        k.target!.eatTimer = 1.6
      } else k.moveTo(t.x, t.z, dt)
      break
    }
    case 'feed':
      if ((k.timer -= dt) <= 0) {
        g.feed(k.target!)
        k.target = null
        k.phase = k.exit ? 'exit' : 'idle'
      }
      break
    case 'exit':
      if (!k.exit || k.moveTo(toWorld(k.exit.x), toWorld(k.exit.y), dt)) {
        k.exit = null
        k.phase = 'idle'
      }
      break
  }
}

function pickJob(g: Game, k: Keeper) {
  const claimed = new Set(g.keepers.map((o) => o.target))
  const p = k.group.position
  let best = null
  let bestScore = -Infinity
  for (const a of g.animals) {
    if (a.hunger <= 45 || claimed.has(a) || g.money < a.species.feedCost) continue
    const q = a.group.position
    const score = a.hunger - Math.hypot(q.x - p.x, q.z - p.z) * 1.5
    if (score > bestScore) {
      best = a
      bestScore = score
    }
  }
  return best
}

function plan(g: Game, k: Keeper) {
  if (g.tile(k.px, k.py) === T_PATH) {
    const b = g.bfs(k.px, k.py)
    const spots = g.spotsFor(k.target!, b).sort((p, q) => p.d - q.d)
    if (spots.length) {
      k.path = g.pathTo(b, spots[0].x, spots[0].y)
      k.exit = { x: spots[0].x, y: spots[0].y }
      k.phase = 'walk'
      return
    }
  }
  k.phase = 'enter' // no connected path: walk straight there
}
