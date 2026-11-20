import * as THREE from 'three'
import { mat } from './models'

/** Shared by every lamp so main.ts can switch them all on at night. */
export const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffe9b0,
  emissive: 0xffb84a,
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
      break
    case 'restroom':
      box(g, 0.7, 1.0, 0.7, 0x7fa0b8, 0, 0.5, 0)
      box(g, 0.82, 0.08, 0.82, 0x3f5568, 0, 1.04, 0)
      box(g, 0.28, 0.72, 0.02, 0xf0f0f0, 0, 0.4, 0.36)
      box(g, 0.1, 0.1, 0.02, 0x2f6fc4, -0.2, 0.82, 0.36)
      box(g, 0.1, 0.1, 0.02, 0xd9548b, 0.2, 0.82, 0.36)
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
      break
    }
    case 'tree':
      cyl(g, 0.06, 0.09, 0.5, 0x5a3f2a, 0, 0.25, 0, 6)
      ball(g, 0.38, 0x3f7d3a, 0, 0.78, 0)
      ball(g, 0.26, 0x4a8f43, 0.18, 1.0, 0.05)
      break
    case 'flowers': {
      const mound = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.08, 8), mat(0x3f7d3a))
      mound.position.y = 0.04
      g.add(mound)
      const cols = [0xe94f64, 0xf2c230, 0xf4f1ea, 0x9b6bd6, 0xf08a3c]
      for (let i = 0; i < 9; i++) {
        const a = i * 2.4
        const r = 0.05 + (i % 3) * 0.09
        ball(g, 0.05, cols[i % cols.length], Math.cos(a) * r, 0.13, Math.sin(a) * r)
      }
      break
    }
    case 'bench':
      box(g, 0.72, 0.06, 0.26, 0x8a5a2b, 0, 0.28, 0)
      box(g, 0.72, 0.3, 0.05, 0x8a5a2b, 0, 0.5, -0.12)
      box(g, 0.06, 0.28, 0.24, 0x3a3a3a, -0.3, 0.14, 0)
      box(g, 0.06, 0.28, 0.24, 0x3a3a3a, 0.3, 0.14, 0)
      break
    case 'lamp': {
      cyl(g, 0.03, 0.04, 1.3, 0x2c2f33, 0, 0.65, 0, 6)
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), lampMat)
      head.position.y = 1.36
      g.add(head)
      break
    }
  }
  return g
}
