import type { Game } from '../game'
import type { Keeper } from '../entities/people'
import { BREEDING, N, T_PATH, TREAT_COST, toWorld } from '../config'

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
      if (g.tile(k.px, k.py) !== T_PATH) {
        // stranded off the paths (the gate or path they used changed under them): walk to the nearest path
        const p = nearestPath(g, k.px, k.py)
        if (p) k.moveTo(toWorld(p.x), toWorld(p.y), dt)
        return
      }
      if ((k.thinkT -= dt) > 0) return
      k.thinkT = 0.35 + Math.random() * 0.15
      const job = pickJob(g, k)
      if (!job) return
      k.target = job
      k.job = k.duty
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
        k.timer = k.job === 'breed' ? BREEDING.workTime : k.feedTime
        k.target!.eatTimer = k.timer + 0.2
      } else k.moveTo(t.x, t.z, dt)
      break
    }
    case 'feed':
      if ((k.timer -= dt) <= 0) {
        const a = k.target!
        if (k.job === 'breed') g.completeBreeding(k, a)
        else {
          if (a.sick) g.treat(a)
          if (a.hunger > k.feedAt) {
            g.feed(a)
            k.fed++
          }
        }
        k.target = null
        k.phase = k.exit ? 'exit' : 'idle'
      }
      break
    case 'exit':
      if (k.gate) {
        if (k.moveTo(toWorld(k.gate.x), toWorld(k.gate.y), dt)) k.gate = null
      } else if (!k.exit || k.moveTo(toWorld(k.exit.x), toWorld(k.exit.y), dt)) {
        k.exit = null
        k.phase = 'idle'
      }
      break
  }
}

function nearestPath(g: Game, x: number, y: number) {
  let best: { x: number; y: number } | null = null
  let bestD = Infinity
  for (let ty = 0; ty < N; ty++)
    for (let tx = 0; tx < N; tx++)
      if (g.tile(tx, ty) === T_PATH) {
        const d = (tx - x) ** 2 + (ty - y) ** 2
        if (d < bestD) {
          bestD = d
          best = { x: tx, y: ty }
        }
      }
  return best
}

function pickJob(g: Game, k: Keeper) {
  const claimed = new Set(g.keepers.map((o) => o.target))
  const p = k.group.position
  let best = null
  let bestScore = -Infinity
  if (g.tile(k.px, k.py) !== T_PATH) return null
  const b = g.bfs(k.px, k.py)
  if (k.duty === 'breed') {
    // breeding keepers only look for animals the player has ordered to breed, nearest first
    for (const a of g.animals) {
      if (!a.breedOrder || claimed.has(a) || g.money < g.breedFee(a)) continue
      if (!g.gateSpotsFor(a, b).length) continue
      const q = a.group.position
      const score = -Math.hypot(q.x - p.x, q.z - p.z)
      if (score > bestScore) {
        best = a
        bestScore = score
      }
    }
    return best
  }
  for (const a of g.animals) {
    const needsTreat = a.sick && g.hasClinic && g.money >= TREAT_COST
    const needsFeed = a.hunger > k.feedAt && g.money >= a.species.feedCost
    if (claimed.has(a) || (!needsTreat && !needsFeed)) continue
    if (!g.gateSpotsFor(a, b).length) continue // no reachable gate: keepers can't get in
    const q = a.group.position
    // sick animals come first, then the hungriest nearby
    const score = (needsTreat ? 100 : 0) + (needsFeed ? a.hunger : 0) - Math.hypot(q.x - p.x, q.z - p.z) * 1.5
    if (score > bestScore) {
      best = a
      bestScore = score
    }
  }
  return best
}

function plan(g: Game, k: Keeper) {
  const b = g.bfs(k.px, k.py)
  const spot = g.gateSpotsFor(k.target!, b).sort((p, q) => p.d - q.d)[0]
  if (!spot) {
    k.target = null
    k.phase = 'idle'
    return
  }
  k.path = [...g.pathTo(b, spot.x, spot.y), { x: spot.gx, y: spot.gy }]
  k.exit = { x: spot.x, y: spot.y }
  k.gate = { x: spot.gx, y: spot.gy }
  k.phase = 'walk'
}
