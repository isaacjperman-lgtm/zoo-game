import * as THREE from 'three'
import { mat, isFlatColor, personModel } from './models'
import { bakeModel } from './bake'

/** Shared by every lamp so main.ts can switch them all on at night. */
export const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffe9b0,
  emissive: 0xffb84a,
  emissiveIntensity: 0,
})

/** A soft round gradient, built from raw pixels so it also works outside a browser (tests). */
function glowTexture() {
  const n = 64
  const data = new Uint8Array(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const r = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2)
      const a = Math.max(0, 1 - r) ** 2
      data.set([255, 196, 112, Math.round(a * 255)], (y * n + x) * 4)
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat)
  t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}
/** The pool of light a lamp casts on the ground. Shared by every lamp; main.ts raises its opacity at night. */
export const lampGlowMat = new THREE.MeshBasicMaterial({
  map: glowTexture(),
  transparent: true,
  opacity: 0,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
})

/** Stage spotlights share one material so main.ts can switch them on while a show is running. */
export const stageLightMat = new THREE.MeshStandardMaterial({
  color: 0xfff0b0,
  emissive: 0xffd25a,
  emissiveIntensity: 0,
})

function box(g: THREE.Group, w: number, h: number, d: number, c: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c))
  m.position.set(x, y, z)
  m.castShadow = m.receiveShadow = true
  g.add(m)
  return m
}
function cyl(
  g: THREE.Group,
  rt: number,
  rb: number,
  h: number,
  c: number,
  x: number,
  y: number,
  z: number,
  seg = 7,
) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c))
  m.position.set(x, y, z)
  m.castShadow = true
  g.add(m)
  return m
}
function ball(g: THREE.Group, r: number, c: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat(c))
  m.position.set(x, y, z)
  m.castShadow = true
  g.add(m)
  return m
}

/** Awning of alternating stripes sloping down toward the front (+z). */
function awning(g: THREE.Group, w: number, y: number, z: number, a: number, b: number) {
  const n = 6
  for (let i = 0; i < n; i++) {
    const s = box(g, w / n, 0.04, 0.4, i % 2 ? a : b, -w / 2 + (i + 0.5) * (w / n), y, z)
    s.rotation.x = 0.3
  }
}

/** Models face +z; Game rotates them toward the nearest path. */
export function propModel(id: string) {
  const g = new THREE.Group()
  switch (id) {
    case 'food':
      box(g, 0.8, 0.55, 0.7, 0xc9a16a, 0, 0.275, -0.05)
      box(g, 0.9, 0.06, 0.4, 0x6b4a2e, 0, 0.58, 0.2)
      cyl(g, 0.025, 0.025, 0.75, 0x6b4a2e, -0.38, 0.95, 0.3, 5)
      cyl(g, 0.025, 0.025, 0.75, 0x6b4a2e, 0.38, 0.95, 0.3, 5)
      awning(g, 0.95, 1.3, 0.15, 0xc0392b, 0xf4f1ea)
      cyl(g, 0.03, 0.03, 0.14, 0xd93a2b, -0.2, 0.68, 0.22, 6)
      cyl(g, 0.03, 0.03, 0.14, 0xf2c230, -0.1, 0.68, 0.22, 6)
      box(g, 0.14, 0.1, 0.14, 0xf0e0b0, 0.25, 0.64, 0.22)
      // menu board and a red stripe along the front
      box(g, 0.34, 0.2, 0.03, 0x2c3a33, 0.2, 0.9, -0.38)
      box(g, 0.24, 0.02, 0.01, 0xf4f1ea, 0.2, 0.95, -0.36)
      box(g, 0.2, 0.02, 0.01, 0xf2c230, 0.2, 0.88, -0.36)
      box(g, 0.8, 0.07, 0.02, 0xc0392b, 0, 0.3, 0.31)
      break
    case 'restroom':
      // low block on a plinth with two doors (blue/pink), a window strip and a sloped roof
      box(g, 0.76, 0.08, 0.76, 0x9aa3ab, 0, 0.04, 0)
      box(g, 0.7, 0.72, 0.7, 0x7fa0b8, 0, 0.44, 0)
      box(g, 0.78, 0.06, 0.78, 0x3f5568, 0, 0.83, 0)
      box(g, 0.8, 0.05, 0.84, 0x4d667c, 0, 0.88, -0.02).rotation.x = -0.12
      for (const [sx, c] of [
        [-1, 0x2f6fc4],
        [1, 0xd9548b],
      ] as const) {
        box(g, 0.22, 0.52, 0.02, 0xf0f0f0, sx * 0.17, 0.34, 0.36)
        box(g, 0.1, 0.1, 0.025, c, sx * 0.17, 0.58, 0.365)
        box(g, 0.02, 0.05, 0.03, 0x3a3a3a, sx * 0.08, 0.34, 0.37)
      }
      box(g, 0.5, 0.06, 0.02, 0xbfe6f0, 0, 0.72, 0.36)
      cyl(g, 0.03, 0.03, 0.12, 0x9aa3ab, 0.25, 0.94, -0.2, 6)
      break
    case 'gift': {
      box(g, 0.9, 0.75, 0.75, 0xe58fa8, 0, 0.375, 0)
      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.4, 4), mat(0x7a3b5e))
      roof.position.y = 0.95
      roof.rotation.y = Math.PI / 4
      roof.castShadow = true
      g.add(roof)
      box(g, 0.28, 0.5, 0.02, 0xf4ecd8, -0.2, 0.28, 0.38)
      box(g, 0.28, 0.28, 0.02, 0xbfe6f0, 0.22, 0.45, 0.38)
      awning(g, 0.9, 0.78, 0.5, 0x3aa6a0, 0xf4f1ea)
      box(g, 0.16, 0.16, 0.16, 0xf2c230, 0, 1.25, 0)
      box(g, 0.17, 0.03, 0.03, 0xd93a2b, 0, 1.25, 0.08)
      box(g, 0.03, 0.17, 0.03, 0xd93a2b, 0, 1.25, 0.08)
      // window display of plush toys and a sign over the door
      ball(g, 0.05, 0xf4f1ea, 0.15, 0.4, 0.4)
      ball(g, 0.04, 0xf4f1ea, 0.15, 0.45, 0.4)
      ball(g, 0.05, 0x8a5a3a, 0.29, 0.4, 0.4)
      box(g, 0.3, 0.07, 0.03, 0xf4ecd8, -0.2, 0.64, 0.39)
      break
    }
    case 'tree':
      cyl(g, 0.06, 0.09, 0.55, 0x5a3f2a, 0, 0.27, 0, 6)
      ball(g, 0.4, 0x3f7d3a, 0, 0.85, 0)
      ball(g, 0.28, 0x4a8f43, 0.2, 1.06, 0.06)
      ball(g, 0.22, 0x357033, -0.2, 0.98, -0.08)
      for (const [x, z] of [
        [0.12, 0.1],
        [-0.1, 0.12],
      ])
        ball(g, 0.05, 0x7a7a72, x, 0.03, z)
      break
    case 'flowers': {
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 8), mat(0x3f7d3a))
      mound.position.y = 0.04
      g.add(mound)
      const cols = [0xe94f64, 0xf2c230, 0xf4f1ea, 0x9b6bd6, 0xf08a3c]
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4,
          r = 0.05 + (i % 4) * 0.075
        const x = Math.cos(a) * r,
          z = Math.sin(a) * r
        cyl(g, 0.008, 0.008, 0.1 + (i % 3) * 0.03, 0x3a7a35, x, 0.1, z, 4)
        ball(g, 0.045, cols[i % cols.length], x, 0.17 + (i % 3) * 0.03, z)
        ball(g, 0.018, 0xf2c230, x, 0.2 + (i % 3) * 0.03, z)
      }
      for (let i = 0; i < 8; i++)
        ball(g, 0.05, 0x7a7a72, Math.cos(i * 0.785) * 0.4, 0.04, Math.sin(i * 0.785) * 0.4)
      break
    }
    case 'bench':
      box(g, 0.72, 0.06, 0.26, 0x8a5a2b, 0, 0.28, 0)
      box(g, 0.72, 0.3, 0.05, 0x8a5a2b, 0, 0.5, -0.12)
      box(g, 0.06, 0.28, 0.24, 0x3a3a3a, -0.3, 0.14, 0)
      box(g, 0.06, 0.28, 0.24, 0x3a3a3a, 0.3, 0.14, 0)
      box(g, 0.72, 0.03, 0.05, 0x6b431f, 0, 0.6, -0.12)
      box(g, 0.72, 0.03, 0.05, 0x6b431f, 0, 0.42, -0.12)
      for (const sx of [-1, 1]) box(g, 0.05, 0.04, 0.24, 0x3a3a3a, sx * 0.34, 0.4, 0)
      break
    case 'icecream': {
      // a little cart: pale blue body, striped umbrella, and a cone on a sign
      box(g, 0.72, 0.4, 0.5, 0x7ec8e3, 0, 0.32, 0)
      box(g, 0.8, 0.05, 0.58, 0xf4f1ea, 0, 0.55, 0)
      box(g, 0.5, 0.08, 0.3, 0xdff3fa, 0, 0.6, 0.02)
      for (const sx of [-1, 1])
        cyl(g, 0.09, 0.09, 0.05, 0x3a3a3a, sx * 0.38, 0.1, 0.12, 10).rotation.z = Math.PI / 2
      cyl(g, 0.02, 0.02, 0.85, 0x6b4a2e, 0.3, 0.98, -0.18, 5)
      const umb = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.26, 8), mat(0xe98fb0))
      umb.position.set(0.15, 1.4, -0.05)
      umb.castShadow = true
      g.add(umb)
      ball(g, 0.05, 0xf4f1ea, 0.15, 1.56, -0.05)
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.2, 7), mat(0xd9a05b))
      cone.rotation.x = Math.PI
      cone.position.set(-0.22, 0.78, 0.18)
      g.add(cone)
      ball(g, 0.075, 0xf29ac0, -0.22, 0.93, 0.18)
      ball(g, 0.05, 0xf4f1ea, -0.22, 1.0, 0.18)
      break
    }
    case 'fountain': {
      cyl(g, 0.46, 0.5, 0.16, 0x9aa3ab, 0, 0.08, 0, 16)
      cyl(g, 0.38, 0.38, 0.05, 0x5fb4e8, 0, 0.17, 0, 16)
      cyl(g, 0.07, 0.1, 0.42, 0xb9c0c6, 0, 0.38, 0, 8)
      cyl(g, 0.22, 0.16, 0.06, 0xb9c0c6, 0, 0.6, 0, 12)
      cyl(g, 0.17, 0.17, 0.03, 0x5fb4e8, 0, 0.64, 0, 12)
      const spray = new THREE.Mesh(
        new THREE.ConeGeometry(0.09, 0.32, 8),
        new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.7 }),
      )
      spray.position.y = 0.82
      g.add(spray)
      g.userData.spray = spray
      break
    }
    case 'arena': {
      // a small stage with curtains, bunting, spotlights and a performer who gets going during shows
      box(g, 0.95, 0.1, 0.82, 0x8a5a2b, 0, 0.05, 0)
      box(g, 0.95, 0.75, 0.06, 0xb23a5a, 0, 0.47, -0.37)
      for (const sx of [-1, 1]) box(g, 0.12, 0.75, 0.22, 0x7a2a45, sx * 0.42, 0.47, -0.27)
      box(g, 1.0, 0.07, 0.5, 0xf2c230, 0, 0.88, -0.22)
      const cols = [0xe94f64, 0xf2c230, 0x3aa6a0, 0xf4f1ea]
      for (let i = 0; i < 7; i++) ball(g, 0.04, cols[i % 4], -0.42 + i * 0.14, 0.8, 0.14)
      for (const sx of [-1, 1]) {
        cyl(g, 0.02, 0.02, 0.5, 0x2c2f33, sx * 0.46, 0.35, 0.34, 5)
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), stageLightMat)
        lamp.position.set(sx * 0.46, 0.62, 0.34)
        g.add(lamp)
      }
      const performer = personModel(0xd9548b)
      performer.position.set(0, 0.1, -0.08)
      performer.scale.setScalar(0.95)
      g.add(performer)
      g.userData.performer = performer
      break
    }
    case 'vet':
      box(g, 0.85, 0.7, 0.7, 0xf4f4f0, 0, 0.35, 0)
      box(g, 0.97, 0.08, 0.82, 0x3f8f6a, 0, 0.74, 0)
      box(g, 0.24, 0.06, 0.02, 0xd93a2b, 0, 0.54, 0.36)
      box(g, 0.06, 0.24, 0.02, 0xd93a2b, 0, 0.54, 0.36)
      box(g, 0.2, 0.42, 0.02, 0x7fa0b8, 0.24, 0.23, 0.36)
      box(g, 0.2, 0.2, 0.02, 0xbfe6f0, -0.24, 0.36, 0.36)
      box(g, 0.5, 0.12, 0.03, 0x3f8f6a, 0, 0.9, 0.3)
      // pitched roof, step, paw-print sign and a bush
      const gable = new THREE.Mesh(new THREE.ConeGeometry(0.7, 0.26, 4), mat(0x3f8f6a))
      gable.position.y = 0.9
      gable.rotation.y = Math.PI / 4
      gable.scale.set(1.05, 1, 0.9)
      gable.castShadow = true
      g.add(gable)
      box(g, 0.34, 0.04, 0.12, 0xb9c0c6, 0.24, 0.02, 0.42)
      ball(g, 0.05, 0x8a5a3a, -0.3, 0.7, 0.4)
      for (const px of [-0.34, -0.3, -0.26]) ball(g, 0.018, 0x8a5a3a, px, 0.75, 0.4)
      ball(g, 0.1, 0x3f7d3a, -0.38, 0.1, 0.42)
      break
    case 'lamp': {
      cyl(g, 0.03, 0.04, 1.3, 0x2c2f33, 0, 0.65, 0, 6)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampMat)
      head.position.y = 1.36
      g.add(head)
      // a little hood over the bulb, with a collar below it and a knob on top
      cyl(g, 0.07, 0.05, 0.05, 0x2c2f33, 0, 1.27, 0, 10)
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.14, 12), mat(0x3d6b4a))
      shade.position.y = 1.52
      shade.castShadow = true
      g.add(shade)
      ball(g, 0.03, 0x2c2f33, 0, 1.62, 0)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), lampGlowMat)
      pool.rotation.x = -Math.PI / 2
      pool.position.y = 0.07
      pool.renderOrder = 2
      pool.userData.noFrame = true
      g.add(pool)
      break
    }
  }
  return bakeModel(g, isFlatColor) // one draw call for the building's plain parts
}
