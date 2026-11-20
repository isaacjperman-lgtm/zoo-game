import * as THREE from 'three'
import type { Species } from '../data/species'

const cache = new Map<number, THREE.MeshStandardMaterial>()
export function mat(c: number) {
  let m = cache.get(c)
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.88, flatShading: true })
    cache.set(c, m)
  }
  return m
}

type Geo = THREE.BufferGeometry
function add(p: THREE.Object3D, geo: Geo, c: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat(c))
  m.position.set(x, y, z)
  m.castShadow = true
  p.add(m)
  return m
}

interface Limb {
  o: THREE.Object3D
  phase: number
  k: number
}
interface Rig {
  legs: Limb[]
  speed: number
  amp: number
  wobble?: boolean
  /** Bounce up and down while moving (kangaroos). */
  hop?: boolean
}

/** Swing legs/arms while an entity is moving. */
export function animateRig(g: THREE.Object3D, t: number, moving: boolean, dt: number) {
  const rig = g.userData.rig as Rig | undefined
  if (!rig) return
  rig.amp += ((moving ? 1 : 0) - rig.amp) * Math.min(1, dt * 8)
  for (const l of rig.legs) l.o.rotation.x = Math.sin(t * rig.speed + l.phase) * 0.6 * l.k * rig.amp
  if (rig.wobble) g.rotation.z = Math.sin(t * rig.speed) * 0.14 * rig.amp
  if (rig.hop) g.position.y = 0.05 + Math.abs(Math.sin(t * rig.speed)) * 0.22 * rig.amp
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return seed / 2147483647
  }
}

function head(k: number, c: number, snout: number) {
  const h = new THREE.Group()
  add(h, new THREE.BoxGeometry(k * 0.34, k * 0.36, k * 0.42), c)
  add(h, new THREE.BoxGeometry(k * 0.24, k * 0.2, k * 0.28), snout, 0, -k * 0.07, k * 0.3)
  for (const sx of [-1, 1]) {
    add(h, new THREE.SphereGeometry(k * 0.035, 6, 6), 0x111111, sx * k * 0.15, k * 0.07, k * 0.14)
    const ear = add(h, new THREE.ConeGeometry(k * 0.06, k * 0.16, 5), c, sx * k * 0.11, k * 0.26, -k * 0.08)
    ear.rotation.z = -sx * 0.25
  }
  return h
}

function tail(g: THREE.Group, x: number, y: number, z: number, len: number, c: number, tuft?: number) {
  const p = new THREE.Group()
  p.position.set(x, y, z)
  p.rotation.x = 0.6
  add(p, new THREE.CylinderGeometry(len * 0.04, len * 0.03, len, 5), c, 0, -len / 2, 0)
  if (tuft !== undefined) add(p, new THREE.SphereGeometry(len * 0.12, 6, 6), tuft, 0, -len, 0)
  g.add(p)
}

function quadruped(s: Species) {
  const g = new THREE.Group(),
    legs: Limb[] = [],
    k = s.size,
    id = s.id
  const rand = seeded(id.length * 977 + 13)
  const dims: Record<string, number[]> = {
    // leg height, body height, body length, body width, leg radius (all x size)
    giraffe: [1.7, 0.8, 1.6, 0.72, 0.075],
    elephant: [0.75, 1.05, 1.8, 1.0, 0.17],
    bear: [0.55, 0.95, 1.5, 0.85, 0.12],
    hippo: [0.4, 1.0, 1.8, 1.05, 0.16],
    rhino: [0.5, 1.0, 1.8, 0.95, 0.15],
  }
  const [dl, dbh, dbl, dbw, dlr] = dims[id] ?? [0.8, 0.8, 1.6, 0.72, 0.085]
  const legH = k * dl
  const bh = k * dbh
  const bl = k * dbl
  const bw = k * dbw
  const hip = legH + bh * 0.12,
    by = legH + bh * 0.42

  const body = add(g, new THREE.CapsuleGeometry(bh / 2, bl - bh, 4, 10), s.color, 0, by, 0)
  body.rotation.x = Math.PI / 2
  body.scale.x = bw / bh

  const lr = k * dlr
  for (const [sx, sz, ph] of [
    [1, 1, 0],
    [-1, -1, 0],
    [-1, 1, Math.PI],
    [1, -1, Math.PI],
  ]) {
    const p = new THREE.Group()
    p.position.set(sx * bw * 0.3, hip, sz * bl * 0.3)
    add(p, new THREE.CylinderGeometry(lr, lr * 0.85, hip, 7), s.color, 0, -hip / 2, 0)
    add(
      p,
      new THREE.CylinderGeometry(lr * 0.92, lr * 0.97, hip * 0.09, 7),
      id === 'elephant' ? 0xd8d0c0 : 0x2b2420,
      0,
      -hip * 0.95,
      0,
    )
    g.add(p)
    legs.push({ o: p, phase: ph, k: 1 })
  }

  if (id === 'giraffe') {
    const len = k * 1.5
    const neck = new THREE.Group()
    neck.position.set(0, by + bh * 0.2, bl * 0.38)
    neck.rotation.x = 0.28
    add(neck, new THREE.CylinderGeometry(k * 0.09, k * 0.14, len, 7), s.color, 0, len / 2, 0)
    const h = head(k, s.color, 0xf0d9a0)
    h.position.set(0, len + k * 0.05, k * 0.08)
    h.rotation.x = 0.5
    for (const sx of [-1, 1])
      add(
        h,
        new THREE.CylinderGeometry(k * 0.02, k * 0.025, k * 0.16, 5),
        s.accent,
        sx * k * 0.07,
        k * 0.28,
        -k * 0.02,
      )
    neck.add(h)
    g.add(neck)
    for (let i = 0; i < 16; i++) {
      const th = (rand() - 0.5) * 3.4,
        z = (rand() - 0.5) * (bl - bh) * 0.95
      add(
        g,
        new THREE.SphereGeometry(k * 0.07, 6, 5),
        s.accent,
        Math.sin(th) * bw * 0.49,
        by + Math.cos(th) * bh * 0.49,
        z,
      )
    }
    for (let i = 0; i < 6; i++)
      add(
        neck,
        new THREE.SphereGeometry(k * 0.06, 6, 5),
        s.accent,
        (rand() - 0.5) * k * 0.2,
        len * (0.1 + rand() * 0.7),
        k * 0.1,
      )
    tail(g, 0, by + bh * 0.25, -bl * 0.5, k * 0.8, s.color, s.accent)
  } else {
    add(
      g,
      new THREE.BoxGeometry(k * 0.26, k * 0.42, k * 0.3),
      s.color,
      0,
      by + bh * 0.35,
      bl * 0.4,
    ).rotation.x = 0.5
    const hk = { elephant: 1.5, hippo: 1.6, bear: 1.15, rhino: 1.45 }[id] ?? 1
    const snout = { lion: 0xe8c27a, zebra: 0x2a2a2e, bear: 0x8a6a4a, hippo: 0xb09aa6 }[id] ?? s.color
    const headY = { elephant: 0.2, hippo: 0.15, bear: 0.45, rhino: 0.1 }[id] ?? 0.55
    const headZ = { elephant: 0.58, hippo: 0.6, bear: 0.58, rhino: 0.62 }[id] ?? 0.55
    const h = head(k * hk, s.color, snout)
    h.position.set(0, by + bh * headY, bl * headZ)
    g.add(h)

    if (id === 'zebra') {
      const ringLen = (bl - bh) * 0.46
      for (let i = 0; i < 8; i++) {
        const ring = add(
          g,
          new THREE.TorusGeometry((bh / 2) * 1.002, k * 0.03, 5, 14),
          0x1b1b1f,
          0,
          by,
          -ringLen + i * ((ringLen * 2) / 7),
        )
        ring.scale.x = bw / bh
      }
      for (let i = 0; i < 4; i++)
        add(
          g,
          new THREE.BoxGeometry(k * 0.05, k * 0.1, k * 0.07),
          0x1b1b1f,
          0,
          by + bh * 0.6 + i * k * 0.04,
          bl * 0.42 + i * k * 0.07,
        )
      tail(g, 0, by + bh * 0.2, -bl * 0.5, k * 0.7, 0x1b1b1f)
    } else if (id === 'lion') {
      const mane = add(h, new THREE.IcosahedronGeometry(k * 0.3, 1), s.accent, 0, 0, -k * 0.06)
      mane.scale.set(1.15, 1.1, 0.9)
      tail(g, 0, by + bh * 0.2, -bl * 0.5, k * 1.0, s.color, s.accent)
    } else if (id === 'elephant') {
      for (const sx of [-1, 1]) {
        const ear = add(
          h,
          new THREE.CylinderGeometry(k * 0.42, k * 0.42, k * 0.035, 10),
          0x7b7b87,
          sx * k * 0.52,
          k * 0.1,
          -k * 0.12,
        )
        ear.rotation.z = Math.PI / 2
        ear.rotation.y = sx * 0.4
        ear.scale.set(1, 1, 0.9)
        const tusk = add(
          h,
          new THREE.ConeGeometry(k * 0.035, k * 0.4, 5),
          0xf4ecd6,
          sx * k * 0.2,
          -k * 0.28,
          k * 0.52,
        )
        tusk.rotation.x = 1.2
      }
      const segs: [number, number, number, number][] = [
        [0, -0.22, 0.6, 0.13],
        [0, -0.55, 0.68, 0.11],
        [0, -0.85, 0.76, 0.09],
        [0, -1.1, 0.82, 0.075],
      ]
      for (const [x, y, z, r] of segs)
        add(h, new THREE.CylinderGeometry(k * r, k * r * 0.88, k * 0.34, 7), s.color, x, k * y, k * z)
      tail(g, 0, by + bh * 0.15, -bl * 0.52, k * 0.8, s.color, 0x6c6c78)
    } else if (id === 'bear') {
      tail(g, 0, by + bh * 0.2, -bl * 0.5, k * 0.25, s.color)
    } else if (id === 'rhino') {
      // two horns, a big one and a little one, plus plated hide lines
      const K = k * 1.45
      add(h, new THREE.ConeGeometry(K * 0.085, K * 0.46, 7), 0xe9e1cf, 0, K * 0.13, K * 0.43).rotation.x =
        0.55
      add(h, new THREE.ConeGeometry(K * 0.055, K * 0.22, 7), 0xe9e1cf, 0, K * 0.15, K * 0.27).rotation.x = 0.3
      for (const sx of [-1, 1])
        add(h, new THREE.SphereGeometry(K * 0.045, 6, 6), 0x111111, sx * K * 0.17, K * 0.04, K * 0.2)
      for (let i = 0; i < 2; i++) {
        const fold = add(
          g,
          new THREE.TorusGeometry((bh / 2) * 1.003, k * 0.035, 5, 14),
          s.accent,
          0,
          by,
          bl * (0.18 - i * 0.3),
        )
        fold.scale.x = bw / bh
      }
      tail(g, 0, by + bh * 0.2, -bl * 0.5, k * 0.45, s.accent, 0x3a3a42)
    } else if (id === 'hippo') {
      const kk = k * 1.6
      for (const sx of [-1, 1])
        add(h, new THREE.SphereGeometry(kk * 0.035, 6, 6), s.accent, sx * kk * 0.08, kk * 0.06, kk * 0.44)
      tail(g, 0, by + bh * 0.2, -bl * 0.5, k * 0.3, s.accent)
    }
  }
  g.userData.rig = { legs, speed: 7, amp: 0 } satisfies Rig
  return g
}

function penguin(s: Species) {
  const g = new THREE.Group(),
    k = s.size * 2
  add(g, new THREE.CapsuleGeometry(k * 0.28, k * 0.5, 4, 10), 0x1c1c24, 0, k * 0.62, 0)
  const belly = add(g, new THREE.SphereGeometry(k * 0.26, 10, 8), 0xf4f4f0, 0, k * 0.58, k * 0.1)
  belly.scale.set(0.85, 1.35, 0.55)
  add(g, new THREE.SphereGeometry(k * 0.21, 10, 8), 0x1c1c24, 0, k * 1.12, 0.01)
  add(g, new THREE.ConeGeometry(k * 0.06, k * 0.18, 5), 0xf0902a, 0, k * 1.08, k * 0.24).rotation.x =
    Math.PI / 2
  for (const sx of [-1, 1]) {
    add(g, new THREE.SphereGeometry(k * 0.03, 6, 6), 0xffffff, sx * k * 0.1, k * 1.17, k * 0.16)
    const fl = add(g, new THREE.BoxGeometry(k * 0.06, k * 0.4, k * 0.2), 0x1c1c24, sx * k * 0.32, k * 0.68, 0)
    fl.rotation.z = sx * 0.3
    add(g, new THREE.BoxGeometry(k * 0.16, k * 0.04, k * 0.26), 0xf0902a, sx * k * 0.12, k * 0.02, k * 0.08)
  }
  g.userData.rig = { legs: [], speed: 10, amp: 0, wobble: true } satisfies Rig
  return g
}

function panda(s: Species) {
  const g = new THREE.Group(),
    legs: Limb[] = [],
    k = s.size,
    black = s.accent
  const body = add(g, new THREE.SphereGeometry(k * 0.62, 12, 10), s.color, 0, k * 0.78, 0)
  body.scale.set(0.95, 0.9, 1.2)
  // black shoulder band
  const band = add(g, new THREE.TorusGeometry(k * 0.5, k * 0.17, 6, 14), black, 0, k * 0.8, k * 0.42)
  band.scale.set(1.05, 1.0, 1)
  for (const [sx, sz, ph] of [
    [1, 1, 0],
    [-1, -1, 0],
    [-1, 1, Math.PI],
    [1, -1, Math.PI],
  ]) {
    const p = new THREE.Group()
    p.position.set(sx * k * 0.34, k * 0.5, sz * k * 0.5)
    add(p, new THREE.CylinderGeometry(k * 0.17, k * 0.15, k * 0.5, 8), black, 0, -k * 0.25, 0)
    g.add(p)
    legs.push({ o: p, phase: ph, k: 1 })
  }
  const h = new THREE.Group()
  h.position.set(0, k * 1.0, k * 0.78)
  add(h, new THREE.SphereGeometry(k * 0.4, 12, 10), s.color)
  add(h, new THREE.SphereGeometry(k * 0.16, 8, 8), 0x2a2a2a, 0, -k * 0.08, k * 0.34).scale.set(1, 0.7, 0.9)
  for (const sx of [-1, 1]) {
    add(h, new THREE.SphereGeometry(k * 0.15, 8, 8), black, sx * k * 0.33, k * 0.33, -k * 0.03)
    const patch = add(h, new THREE.SphereGeometry(k * 0.11, 8, 8), black, sx * k * 0.17, k * 0.06, k * 0.3)
    patch.scale.set(0.8, 1.2, 0.5)
    patch.rotation.z = sx * 0.4
    add(h, new THREE.SphereGeometry(k * 0.03, 6, 6), 0xffffff, sx * k * 0.17, k * 0.08, k * 0.34)
  }
  g.add(h)
  add(g, new THREE.SphereGeometry(k * 0.1, 6, 6), s.color, 0, k * 0.85, -k * 0.74)
  g.userData.rig = { legs, speed: 6, amp: 0 } satisfies Rig
  return g
}

function monkey(s: Species) {
  const g = new THREE.Group(),
    legs: Limb[] = [],
    k = s.size * 1.8,
    skin = s.accent
  const body = add(g, new THREE.CapsuleGeometry(k * 0.2, k * 0.35, 4, 8), s.color, 0, k * 0.62, 0)
  body.rotation.x = 0.35
  add(g, new THREE.SphereGeometry(k * 0.16, 8, 8), skin, 0, k * 0.6, k * 0.12).scale.set(1, 1.2, 0.6)
  for (const [sx, ph] of [
    [1, 0],
    [-1, Math.PI],
  ]) {
    // legs
    const l = new THREE.Group()
    l.position.set(sx * k * 0.14, k * 0.38, -k * 0.06)
    add(l, new THREE.CylinderGeometry(k * 0.075, k * 0.06, k * 0.38, 6), s.color, 0, -k * 0.17, 0)
    add(l, new THREE.BoxGeometry(k * 0.12, k * 0.05, k * 0.2), skin, 0, -k * 0.37, k * 0.04)
    g.add(l)
    legs.push({ o: l, phase: ph, k: 1 })
    // long arms, swinging opposite the legs
    const a = new THREE.Group()
    a.position.set(sx * k * 0.27, k * 0.8, k * 0.1)
    add(a, new THREE.CylinderGeometry(k * 0.06, k * 0.05, k * 0.6, 6), s.color, 0, -k * 0.28, 0)
    add(a, new THREE.SphereGeometry(k * 0.07, 6, 6), skin, 0, -k * 0.6, 0)
    g.add(a)
    legs.push({ o: a, phase: ph + Math.PI, k: 1 })
  }
  const h = new THREE.Group()
  h.position.set(0, k * 1.12, k * 0.2)
  add(h, new THREE.SphereGeometry(k * 0.22, 10, 8), s.color)
  add(h, new THREE.SphereGeometry(k * 0.16, 8, 8), skin, 0, -k * 0.04, k * 0.12).scale.set(1.1, 1, 0.8)
  add(h, new THREE.SphereGeometry(k * 0.08, 6, 6), s.color, 0, -k * 0.1, k * 0.24).scale.set(1.2, 0.8, 0.8)
  for (const sx of [-1, 1]) {
    add(h, new THREE.SphereGeometry(k * 0.03, 6, 6), 0x111111, sx * k * 0.08, k * 0.04, k * 0.22)
    add(h, new THREE.SphereGeometry(k * 0.09, 8, 8), skin, sx * k * 0.23, k * 0.02, -k * 0.02)
  }
  g.add(h)
  // long curled tail
  const tp = new THREE.Group()
  tp.position.set(0, k * 0.5, -k * 0.2)
  tp.rotation.x = -2.4
  add(tp, new THREE.CylinderGeometry(k * 0.035, k * 0.03, k * 0.7, 5), s.color, 0, k * 0.35, 0)
  const curl = add(
    tp,
    new THREE.TorusGeometry(k * 0.1, k * 0.03, 5, 8, Math.PI * 1.3),
    s.color,
    0,
    k * 0.78,
    k * 0.08,
  )
  curl.rotation.y = Math.PI / 2
  g.add(tp)
  g.userData.rig = { legs, speed: 9, amp: 0 } satisfies Rig
  return g
}

function kangaroo(s: Species) {
  const g = new THREE.Group(),
    legs: Limb[] = [],
    k = s.size * 1.6,
    belly = s.accent
  // upright body leaning forward
  const body = add(g, new THREE.CapsuleGeometry(k * 0.22, k * 0.42, 4, 8), s.color, 0, k * 0.78, 0)
  body.rotation.x = 0.35
  add(g, new THREE.SphereGeometry(k * 0.16, 8, 8), belly, 0, k * 0.72, k * 0.1).scale.set(1, 1.3, 0.7)
  // powerful hind legs that move together, with long feet
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(sx * k * 0.15, k * 0.5, -k * 0.05)
    add(leg, new THREE.CylinderGeometry(k * 0.1, k * 0.06, k * 0.4, 6), s.color, 0, -k * 0.2, 0)
    add(leg, new THREE.BoxGeometry(k * 0.1, k * 0.05, k * 0.4), s.color, 0, -k * 0.44, k * 0.1)
    g.add(leg)
    legs.push({ o: leg, phase: 0, k: 1 })
    const arm = add(
      g,
      new THREE.CylinderGeometry(k * 0.035, k * 0.03, k * 0.22, 5),
      s.color,
      sx * k * 0.17,
      k * 0.88,
      k * 0.17,
    )
    arm.rotation.x = 0.7
  }
  const h = new THREE.Group()
  h.position.set(0, k * 1.2, k * 0.2)
  add(h, new THREE.SphereGeometry(k * 0.13, 8, 8), s.color)
  add(h, new THREE.BoxGeometry(k * 0.12, k * 0.1, k * 0.18), belly, 0, -k * 0.03, k * 0.13)
  add(h, new THREE.SphereGeometry(k * 0.025, 6, 6), 0x111111, 0, -k * 0.01, k * 0.22)
  for (const sx of [-1, 1]) {
    add(h, new THREE.SphereGeometry(k * 0.022, 6, 6), 0x111111, sx * k * 0.09, k * 0.03, k * 0.09)
    const ear = add(
      h,
      new THREE.ConeGeometry(k * 0.045, k * 0.24, 5),
      s.color,
      sx * k * 0.07,
      k * 0.2,
      -k * 0.02,
    )
    ear.rotation.z = -sx * 0.2
  }
  g.add(h)
  // thick tail dragging behind
  const tail = add(g, new THREE.ConeGeometry(k * 0.12, k * 0.8, 7), s.color, 0, k * 0.28, -k * 0.38)
  tail.rotation.x = -1.3
  g.userData.rig = { legs, speed: 8, amp: 0, hop: true } satisfies Rig
  return g
}

function flamingo(s: Species) {
  const g = new THREE.Group(),
    legs: Limb[] = [],
    k = s.size * 1.7
  const body = add(g, new THREE.SphereGeometry(k * 0.3, 10, 8), s.color, 0, k * 1.1, 0)
  body.scale.set(0.75, 0.8, 1.2)
  add(g, new THREE.ConeGeometry(k * 0.16, k * 0.4, 6), s.color, 0, k * 1.12, -k * 0.38).rotation.x =
    -Math.PI / 2 - 0.2
  // thin legs, and a curved neck ending in a hooked beak
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(sx * k * 0.08, k * 0.95, 0)
    add(leg, new THREE.CylinderGeometry(k * 0.018, k * 0.015, k * 0.95, 5), 0xe85d84, 0, -k * 0.47, 0)
    add(leg, new THREE.BoxGeometry(k * 0.1, k * 0.015, k * 0.14), 0xe85d84, 0, -k * 0.94, k * 0.04)
    g.add(leg)
    legs.push({ o: leg, phase: sx > 0 ? 0 : Math.PI, k: 1 })
  }
  const neck = new THREE.Group()
  neck.position.set(0, k * 1.2, k * 0.26)
  neck.rotation.x = 0.35
  add(neck, new THREE.CylinderGeometry(k * 0.035, k * 0.05, k * 0.7, 6), s.color, 0, k * 0.35, 0)
  const head = new THREE.Group()
  head.position.set(0, k * 0.72, k * 0.04)
  add(head, new THREE.SphereGeometry(k * 0.07, 8, 8), s.color)
  const beak = add(head, new THREE.ConeGeometry(k * 0.04, k * 0.2, 5), s.accent, 0, -k * 0.03, k * 0.12)
  beak.rotation.x = Math.PI / 2 + 0.5
  for (const sx of [-1, 1])
    add(head, new THREE.SphereGeometry(k * 0.015, 5, 5), 0x111111, sx * k * 0.045, k * 0.02, k * 0.045)
  neck.add(head)
  g.add(neck)
  g.userData.rig = { legs, speed: 7, amp: 0 } satisfies Rig
  return g
}

export function animalModel(s: Species) {
  return s.id === 'penguin'
    ? penguin(s)
    : s.id === 'panda'
      ? panda(s)
      : s.id === 'monkey'
        ? monkey(s)
        : quadruped(s)
}

const SKINS = [0xf1c9a5, 0xd9a47a, 0xb97a52, 0x8a5a3a, 0xf6d7bd]
const HAIRS = [0x2b1d14, 0x6a3f1e, 0xc9a040, 0x111111, 0x8a8a8a]
const PANTS = [0x2f3a55, 0x3d3d3d, 0x5b4a37, 0x2b4a3a]
const pick = <T>(a: T[]) => a[(Math.random() * a.length) | 0]

export function personModel(shirt: number, keeper = false) {
  const g = new THREE.Group(),
    legs: Limb[] = []
  const skin = pick(SKINS),
    hair = pick(HAIRS),
    pants = keeper ? 0x3b3f46 : pick(PANTS)
  for (const sx of [-1, 1]) {
    const leg = new THREE.Group()
    leg.position.set(sx * 0.055, 0.27, 0)
    add(leg, new THREE.CylinderGeometry(0.045, 0.04, 0.27, 6), pants, 0, -0.135, 0)
    add(leg, new THREE.BoxGeometry(0.09, 0.04, 0.12), 0x1e1e22, 0, -0.26, 0.02)
    g.add(leg)
    legs.push({ o: leg, phase: sx > 0 ? 0 : Math.PI, k: 1 })
    const arm = new THREE.Group()
    arm.position.set(sx * 0.13, 0.51, 0)
    add(arm, new THREE.CylinderGeometry(0.035, 0.032, 0.22, 6), shirt, 0, -0.11, 0)
    add(arm, new THREE.SphereGeometry(0.035, 6, 6), skin, 0, -0.24, 0)
    g.add(arm)
    legs.push({ o: arm, phase: sx > 0 ? Math.PI : 0, k: 0.8 })
  }
  add(g, new THREE.BoxGeometry(0.2, 0.27, 0.12), shirt, 0, 0.405, 0)
  add(g, new THREE.SphereGeometry(0.085, 10, 8), skin, 0, 0.63, 0)
  if (keeper) {
    add(g, new THREE.CylinderGeometry(0.093, 0.097, 0.05, 10), 0x1d3b75, 0, 0.69, 0)
    add(g, new THREE.BoxGeometry(0.12, 0.014, 0.07), 0x1d3b75, 0, 0.67, 0.09)
  } else {
    const h = add(g, new THREE.SphereGeometry(0.09, 10, 8), hair, 0, 0.655, -0.015)
    h.scale.y = 0.75
  }
  g.userData.rig = { legs, speed: 11, amp: 0 } satisfies Rig
  return g
}
