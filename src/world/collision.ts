import type * as THREE from 'three'
import type { Game } from '../game'
import { T_BOOTH, T_PATH, T_PEN, toTile } from '../config'

const VISITOR = 0,
  KEEPER = 1,
  ANIMAL = 2

interface Body {
  pos: THREE.Vector3
  r: number // collision radius
  mass: number // heavier bodies get pushed less
  kind: number // decides which tiles this body may be pushed onto
  /** Set for walking people: heading while they are moving this frame. */
  walker?: { hx: number; hz: number }
}

/** Tile types a body may be pushed onto (-1 = outside the zoo). Guests stay on paths, animals in pens, nobody in the booth. */
function allowed(kind: number, t: number) {
  return kind === VISITOR ? t === T_PATH || t === -1 : kind === KEEPER ? t !== T_BOOTH : t === T_PEN
}

// reused every frame so the pass allocates almost nothing
const bodies: Body[] = []
const grid = new Map<number, number[]>()
const pairs: number[] = [] // flat list of body index pairs that are close enough to matter
const CELL = 1.2 // larger than the biggest pair of radii, so neighbors are always in the same or adjacent cell
const cellKey = (cx: number, cz: number) => (cx + 512) * 1024 + (cz + 512)

/**
 * Soft collision: overlapping people and animals are pushed apart so nobody stands inside anyone else.
 * Pushes never move a body onto ground it doesn't belong on (guests stay on paths, animals stay in pens,
 * nobody walks into the ticket booth). Bodies are sorted into a grid first, so each one is only compared with its
 * close neighbors instead of with everybody in the zoo.
 */
export function resolveCollisions(g: Game) {
  let n = 0
  const add = (
    pos: THREE.Vector3,
    r: number,
    mass: number,
    kind: number,
    walker?: { hx: number; hz: number },
  ) => {
    let b = bodies[n]
    if (!b) b = bodies[n] = { pos, r, mass, kind }
    b.pos = pos
    b.r = r
    b.mass = mass
    b.kind = kind
    b.walker = walker
    n++
  }
  for (const v of g.visitors) add(v.group.position, 0.16, 1, VISITOR, v.moving ? v : undefined)
  for (const k of g.keepers) add(k.group.position, 0.16, 1, KEEPER, k.moving ? k : undefined)
  const animalStart = n
  for (const a of g.animals) {
    const r = (a.species.id === 'penguin' ? 0.18 : a.species.size * 0.55) * a.growth
    add(a.group.position, r, r * r * 12, ANIMAL)
  }

  const tryMove = (b: Body, dx: number, dz: number) => {
    if (!allowed(b.kind, g.tile(toTile(b.pos.x + dx), toTile(b.pos.z + dz)))) return
    b.pos.x += dx
    b.pos.z += dz
  }

  // sort bodies into grid cells once per frame (they only move a little during the relaxation passes)
  for (const list of grid.values()) list.length = 0
  for (let i = 0; i < n; i++) {
    const key = cellKey(Math.floor(bodies[i].pos.x / CELL), Math.floor(bodies[i].pos.z / CELL))
    const list = grid.get(key)
    if (list) list.push(i)
    else grid.set(key, [i])
  }

  const pair = (i: number, j: number) => {
    const a = bodies[i]
    const b = bodies[j]
    const dx = b.pos.x - a.pos.x
    const dz = b.pos.z - a.pos.z
    const min = a.r + b.r
    if (Math.abs(dx) > min || Math.abs(dz) > min) return
    const dist = Math.hypot(dx, dz)
    if (dist >= min) return
    let nx = dx / dist
    let nz = dz / dist
    if (dist < 1e-4) {
      const ang = Math.random() * Math.PI * 2 // exactly stacked: pick a random direction
      nx = Math.cos(ang)
      nz = Math.sin(ang)
    }
    const overlap = (min - dist) * 0.8
    const share = a.mass / (a.mass + b.mass) // fraction of the push that b takes
    if (a.walker && b.walker) {
      // two people on the move: sidestep rather than shove along the line of travel
      const dot = a.walker.hx * b.walker.hx + a.walker.hz * b.walker.hz
      const rx = -a.walker.hz // a's right-hand side
      const rz = a.walker.hx
      if (dot < -0.3) {
        // head-on: each steps to their own right
        tryMove(a, rx * overlap * 0.5, rz * overlap * 0.5)
        tryMove(b, -rx * overlap * 0.5, -rz * overlap * 0.5)
        return
      }
      if (dot > 0.3) {
        // same way: the one behind swings out to the left to overtake
        const aBehind = a.walker.hx * (b.pos.x - a.pos.x) + a.walker.hz * (b.pos.z - a.pos.z) > 0
        tryMove(aBehind ? a : b, -rx * overlap, -rz * overlap)
        return
      }
    }
    tryMove(a, -nx * overlap * (1 - share), -nz * overlap * (1 - share))
    tryMove(b, nx * overlap * share, nz * overlap * share)
  }

  // find the nearby pairs once, then reuse that short list for every relaxation pass
  let np = 0
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(bodies[i].pos.x / CELL)
    const cz = Math.floor(bodies[i].pos.z / CELL)
    for (let ox = -1; ox <= 1; ox++)
      for (let oz = -1; oz <= 1; oz++) {
        const list = grid.get(cellKey(cx + ox, cz + oz))
        if (list)
          for (const j of list)
            if (j > i) {
              pairs[np++] = i
              pairs[np++] = j
            }
      }
  }
  // a few relaxation passes so crowds settle without overlap
  for (let pass = 0; pass < 3; pass++) for (let p = 0; p < np; p += 2) pair(pairs[p], pairs[p + 1])

  for (let i = animalStart; i < n; i++) {
    const a = g.animals[i - animalStart]
    a.tx = toTile(a.group.position.x)
    a.ty = toTile(a.group.position.z)
  }
}
