import type * as THREE from 'three'
import type { Game } from '../game'
import { T_BOOTH, T_PATH, T_PEN, toTile } from '../config'

interface Body {
  pos: THREE.Vector3
  r: number // collision radius
  mass: number // heavier bodies get pushed less
  allowed: (tile: number) => boolean // tile types this body may be pushed onto (-1 = outside the zoo)
  onMoved?: () => void
}

/**
 * Soft collision: overlapping people and animals are pushed apart so nobody stands inside anyone else.
 * Pushes never move a body onto ground it doesn't belong on (guests stay on paths, animals stay in pens,
 * nobody walks into the ticket booth).
 */
export function resolveCollisions(g: Game) {
  const bodies: Body[] = []
  for (const v of g.visitors)
    bodies.push({ pos: v.group.position, r: 0.16, mass: 1, allowed: (t) => t === T_PATH || t === -1 })
  for (const k of g.keepers)
    bodies.push({ pos: k.group.position, r: 0.16, mass: 1, allowed: (t) => t !== T_BOOTH })
  for (const a of g.animals) {
    const r = a.species.id === 'penguin' ? 0.18 : a.species.size * 0.55
    bodies.push({
      pos: a.group.position,
      r,
      mass: r * r * 12,
      allowed: (t) => t === T_PEN,
      onMoved: () => {
        a.tx = toTile(a.group.position.x)
        a.ty = toTile(a.group.position.z)
      },
    })
  }

  const tryMove = (b: Body, dx: number, dz: number) => {
    if (!b.allowed(g.tile(toTile(b.pos.x + dx), toTile(b.pos.z + dz)))) return
    b.pos.x += dx
    b.pos.z += dz
    b.onMoved?.()
  }

  // a few relaxation passes so crowds settle without overlap
  for (let pass = 0; pass < 3; pass++)
    for (let i = 0; i < bodies.length; i++)
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i]
        const b = bodies[j]
        const dx = b.pos.x - a.pos.x
        const dz = b.pos.z - a.pos.z
        const min = a.r + b.r
        if (Math.abs(dx) > min || Math.abs(dz) > min) continue
        const dist = Math.hypot(dx, dz)
        if (dist >= min) continue
        let nx = dx / dist
        let nz = dz / dist
        if (dist < 1e-4) {
          const ang = Math.random() * Math.PI * 2 // exactly stacked: pick a random direction
          nx = Math.cos(ang)
          nz = Math.sin(ang)
        }
        const overlap = (min - dist) * 0.8
        const share = a.mass / (a.mass + b.mass) // fraction of the push that b takes
        tryMove(a, -nx * overlap * (1 - share), -nz * overlap * (1 - share))
        tryMove(b, nx * overlap * share, nz * overlap * share)
      }
}
