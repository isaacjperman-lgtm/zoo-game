import * as THREE from 'three'
import type { Game } from '../game'
import type { Animal } from '../entities/animal'
import { toWorld, toTile, T_PEN, SICKNESS } from '../config'

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/**
 * One animal's needs and behavior for a frame.
 * Happiness drops with hunger, a cramped pen, loneliness (social species) and sharing with a predator.
 * Animals sleep at night, nap by day (lions most), and pace restlessly when starving.
 */
export function updateAnimal(g: Game, a: Animal, dt: number) {
  const sp = a.species
  // Straight-line walks can clip the corner of a bent pen. If an animal ever ends up off its pen, walk it back.
  if (g.tile(a.tx, a.ty) === T_PEN) a.lastPen = { x: a.tx, y: a.ty }
  else {
    const p = a.group.position
    const home = new THREE.Vector3(toWorld(a.lastPen.x), 0.05, toWorld(a.lastPen.y))
    const d = home.clone().sub(p)
    const step = 0.8 * dt
    if (d.length() <= step) p.copy(home)
    else p.addScaledVector(d.normalize(), step)
    a.tx = toTile(p.x)
    a.ty = toTile(p.z)
    a.target = null
    return
  }
  const reg = g.region(a.tx, a.ty)
  const inPen = g.animals.filter((o) => reg.some((r) => r[0] === o.tx && r[1] === o.ty))
  const same = inPen.filter((o) => o.species === sp).length
  const stressed = !sp.predator && inPen.some((o) => o.species.predator)
  const slow = a.status === 'sleeping' || a.status === 'resting'

  a.hunger = Math.min(100, a.hunger + sp.hungerRate * dt * (slow ? 0.5 : 1))
  if (a.isBaby) a.age += dt
  // Neglect makes animals ill; a vet clinic lets keepers cure them and halves the risk, otherwise they recover alone.
  if (a.immuneT > 0) a.immuneT -= dt
  if (!a.sick) {
    const hungry = a.hunger > SICKNESS.hungerAbove
    const unhappy = a.happiness < SICKNESS.unhappyBelow
    const risk =
      (SICKNESS.baseRisk + (hungry ? SICKNESS.hungerRisk : 0) + (unhappy ? SICKNESS.unhappyRisk : 0)) *
      (g.hasClinic ? SICKNESS.clinicFactor : 1)
    if (a.immuneT <= 0 && Math.random() < risk * dt) {
      a.sick = true
      a.sickCause = hungry ? 'left hungry' : unhappy ? 'unhappy' : 'bad luck'
      g.onMessage(`${a.name} the ${sp.name.toLowerCase()} is sick (${a.sickCause}).`)
    }
  } else if (Math.random() < SICKNESS.recovery * dt) {
    a.sick = false
    a.immuneT = SICKNESS.immunity
  }
  const room = reg.length / (same * sp.space)
  const crowded = room < 1 ? (1 - room) * 40 : 0
  const lonely = sp.social && same === 1
  a.happiness = clamp(
    100 -
      a.hunger * 0.7 -
      crowded -
      (lonely ? 15 : 0) -
      (stressed ? 35 : 0) -
      (a.sick ? SICKNESS.happinessPenalty : 0),
    0,
    100,
  )
  a.issues = []
  if (a.hunger > 60) a.issues.push('Hungry')
  if (crowded > 5) a.issues.push('Crowded')
  if (lonely) a.issues.push('Lonely')
  if (stressed) a.issues.push('Scared of predator')
  if (a.sick)
    a.issues.push(
      `Sick, ${a.sickCause} (${g.hasClinic ? 'a keeper can treat it' : 'build a vet clinic to treat it faster'})`,
    )
  if (!g.hasGate(reg)) a.issues.push('No gate for keepers')
  else if (!g.gateReachable(reg))
    a.issues.push("Keepers can't reach this pen (link a path from the entrance)")

  // pose: lie down a little while resting
  const growth = a.growth // babies are smaller
  const ty = (a.status === 'sleeping' || a.status === 'resting' ? 0.8 : 1) * growth
  a.group.scale.x = a.group.scale.z = growth
  a.group.scale.y += (ty - a.group.scale.y) * Math.min(1, dt * 4)

  if (a.eatTimer > 0) {
    a.eatTimer -= dt
    a.status = 'eating'
    a.target = null
    return
  }
  if (!g.isDay && a.hunger < 85) {
    a.status = 'sleeping'
    a.target = null
    return
  }
  if (a.status === 'sleeping' || a.status === 'eating') {
    a.status = 'wandering'
    a.wait = Math.random() * 3
  }
  if (a.status === 'resting') {
    a.restTimer -= dt
    if (a.restTimer > 0 && a.hunger < 85) return
    a.status = 'wandering'
    a.wait = 1
  }

  a.status = a.hunger > 85 ? 'restless' : 'wandering'
  if (a.target) {
    const p = a.group.position
    const d = a.target.clone().sub(p)
    d.y = 0
    const step = (a.status === 'restless' ? 1.1 : 0.6) * dt
    if (d.length() < step) {
      p.x = a.target.x
      p.z = a.target.z
      a.target = null
      a.wait = a.status === 'restless' ? 0.5 + Math.random() : 1 + Math.random() * 4
      if (
        a.status === 'wandering' &&
        Math.random() < sp.sleepiness * 0.3 * (g.weather === 'rain' ? 1.8 : 1)
      ) {
        a.status = 'resting'
        a.restTimer = 8 + Math.random() * 14
      }
    } else {
      d.normalize()
      const nx = p.x + d.x * step
      const nz = p.z + d.z * step
      if (g.tile(toTile(nx), toTile(nz)) !== T_PEN) {
        // the straight line leaves the pen (a bent enclosure): give up on this target and pick another
        a.target = null
        a.wait = 0.2
        return
      }
      p.x = nx
      p.z = nz
      a.group.rotation.y = Math.atan2(d.x, d.z)
    }
    a.tx = toTile(p.x)
    a.ty = toTile(p.z)
  } else if ((a.wait -= dt) <= 0) {
    a.target = pickTarget(g, a, reg)
  }
}

/** Social animals usually wander toward a herd mate; others pick anywhere in the pen. */
function pickTarget(g: Game, a: Animal, reg: number[][]) {
  let tiles = reg
  if (a.species.social && Math.random() < 0.65) {
    const mates = g.animals.filter(
      (o) => o !== a && o.species === a.species && reg.some((r) => r[0] === o.tx && r[1] === o.ty),
    )
    if (mates.length) {
      const m = mates[(Math.random() * mates.length) | 0]
      const near = reg.filter((r) => Math.abs(r[0] - m.tx) <= 1 && Math.abs(r[1] - m.ty) <= 1)
      if (near.length) tiles = near
    }
  }
  const r = tiles[(Math.random() * tiles.length) | 0]
  if (!r) return null
  return new THREE.Vector3(
    toWorld(r[0]) + (Math.random() - 0.5) * 0.6,
    0.05,
    toWorld(r[1]) + (Math.random() - 0.5) * 0.6,
  )
}
