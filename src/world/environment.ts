import * as THREE from 'three'
import { quality } from '../quality'
import { N, BOOTH, toWorld } from '../config'
import { mat, personModel } from '../entities/models'

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const sm = THREE.MathUtils.smoothstep

export function createEnvironment(scene: THREE.Scene) {
  const r = rng(11)
  const dummy = new THREE.Object3D()
  const half = N / 2

  // ---- ground + approach road ----
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1400, 1400),
    new THREE.MeshStandardMaterial({ color: 0x55883f, roughness: 1 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.position.y = -0.06
  ground.receiveShadow = true
  scene.add(ground)
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 220),
    new THREE.MeshStandardMaterial({ color: 0xb9a67e, roughness: 1 }),
  )
  road.rotation.x = -Math.PI / 2
  road.position.set(0.5, -0.05, half + 110)
  road.receiveShadow = true
  scene.add(road)

  // ---- forest + rocks ----
  type Tree = { x: number; z: number; s: number; rot: number; pine: boolean; hue: number }
  const trees: Tree[] = []
  const free = (x: number, z: number) =>
    !(Math.abs(x) < half + 3 && Math.abs(z) < half + 3) && !(z > 0 && x > -6 && x < 7)
  for (let guard = 0; trees.length < quality.trees && guard < 6000; guard++) {
    const a = r() * Math.PI * 2,
      d = 26 + Math.pow(r(), 1.4) * 170
    const x = Math.cos(a) * d,
      z = Math.sin(a) * d
    if (free(x, z)) trees.push({ x, z, s: 0.8 + r() * 0.9, rot: r() * 6.28, pine: r() < 0.55, hue: r() })
  }
  const pines = trees.filter((t) => t.pine),
    rounds = trees.filter((t) => !t.pine)
  const white = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true })
  const inst = (geo: THREE.BufferGeometry, n: number, shadow = true) => {
    const m = new THREE.InstancedMesh(geo, white, n)
    m.castShadow = shadow
    scene.add(m)
    return m
  }
  const trunks = inst(new THREE.CylinderGeometry(0.1, 0.16, 1.1, 6), trees.length)
  const coneA = inst(new THREE.ConeGeometry(0.85, 1.7, 7), pines.length)
  const coneB = inst(new THREE.ConeGeometry(0.62, 1.4, 7), pines.length)
  const crowns = inst(new THREE.IcosahedronGeometry(0.95, 1), rounds.length)
  const col = new THREE.Color()
  const put = (
    m: THREE.InstancedMesh,
    i: number,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    rot: number,
    c: THREE.Color,
  ) => {
    dummy.position.set(x, y, z)
    dummy.rotation.set(0, rot, 0)
    dummy.scale.set(sx, sy, sx)
    dummy.updateMatrix()
    m.setMatrixAt(i, dummy.matrix)
    m.setColorAt(i, c)
  }
  trees.forEach((t, i) => put(trunks, i, t.x, 0.55 * t.s, t.z, t.s, t.s, t.rot, col.set(0x5a3f2a)))
  pines.forEach((t, i) => {
    col.setHSL(0.37 + (t.hue - 0.5) * 0.06, 0.45, 0.2 + t.hue * 0.07)
    put(coneA, i, t.x, 1.6 * t.s, t.z, t.s, t.s, t.rot, col)
    put(coneB, i, t.x, 2.55 * t.s, t.z, t.s, t.s, t.rot, col)
  })
  rounds.forEach((t, i) =>
    put(
      crowns,
      i,
      t.x,
      1.9 * t.s,
      t.z,
      t.s,
      t.s * 0.9,
      t.rot,
      col.setHSL(0.26 + (t.hue - 0.5) * 0.08, 0.5, 0.3 + t.hue * 0.07),
    ),
  )

  const rocks = inst(new THREE.DodecahedronGeometry(0.6, 0), 70)
  for (let i = 0, n = 0; n < 70 && i < 2000; i++) {
    const a = r() * 6.28,
      d = 25 + r() * 120,
      x = Math.cos(a) * d,
      z = Math.sin(a) * d
    if (!free(x, z)) continue
    dummy.position.set(x, 0.1, z)
    dummy.rotation.set(r(), r() * 6, r())
    dummy.scale.set(0.5 + r() * 1.4, 0.4 + r() * 0.8, 0.5 + r() * 1.4)
    dummy.updateMatrix()
    rocks.setMatrixAt(n, dummy.matrix)
    rocks.setColorAt(n, col.setHSL(0.1, 0.05, 0.38 + r() * 0.15))
    n++
  }

  // ---- perimeter fence (gap at the gate) ----
  const posts = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.14, 0.85, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x9a9a8e, roughness: 0.9 }),
    4 * (N + 1),
  )
  const rails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 0.06, 0.05),
    new THREE.MeshStandardMaterial({ color: 0x2f3b34, roughness: 0.6, metalness: 0.3 }),
    8 * N,
  )
  posts.castShadow = rails.castShadow = true
  let np = 0,
    nr = 0
  for (let side = 0; side < 4; side++) {
    for (let i = 0; i <= N; i++) {
      const u = i - half
      const [x, z] = side === 0 ? [u, half] : side === 1 ? [u, -half] : side === 2 ? [half, u] : [-half, u]
      if (side === 0 && u > -2.6 && u < 3.6) continue
      dummy.position.set(x + (side === 0 ? 0.5 : 0), 0.42, z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      posts.setMatrixAt(np++, dummy.matrix)
    }
    for (let i = 0; i < N; i++) {
      const c = i - half + 0.5
      if (side === 0 && c > -2 && c < 3) continue
      const [x, z] = side === 0 ? [c, half] : side === 1 ? [c, -half] : side === 2 ? [half, c] : [-half, c]
      for (const y of [0.3, 0.62]) {
        dummy.position.set(x + (side === 0 ? 0.5 : 0), y, z)
        dummy.rotation.set(0, side > 1 ? Math.PI / 2 : 0, 0)
        dummy.scale.set(1, 1, 1)
        dummy.updateMatrix()
        rails.setMatrixAt(nr++, dummy.matrix)
      }
    }
  }
  posts.count = np
  rails.count = nr
  scene.add(posts, rails)

  // ---- entrance gate ----
  const stone = new THREE.MeshStandardMaterial({ color: 0xa8a79d, roughness: 0.95, flatShading: true })
  const wood = new THREE.MeshStandardMaterial({ color: 0x4a3524, roughness: 0.8 })
  const lanternMat = new THREE.MeshStandardMaterial({
    color: 0xffe2a0,
    emissive: 0xffb84a,
    emissiveIntensity: 0,
  })
  const lights: THREE.PointLight[] = []
  const gx = toWorld(N >> 1),
    gz = half
  for (const px of [toWorld(18), toWorld(22)]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.4, 0.5), stone)
    pillar.position.set(px, 1.2, gz)
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.72), stone)
    cap.position.set(px, 2.47, gz)
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.3, 0.28), lanternMat)
    lantern.position.set(px, 2.7, gz)
    pillar.castShadow = cap.castShadow = true
    scene.add(pillar, cap, lantern)
    if (quality.gateLights) {
      const light = new THREE.PointLight(0xffc880, 0, 14, 2)
      light.position.set(px, 2.9, gz + 0.3)
      scene.add(light)
      lights.push(light)
    }
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.35, 0.4), wood)
  beam.position.set(gx, 2.55, gz)
  beam.castShadow = true
  scene.add(beam)
  const cv = document.createElement('canvas')
  cv.width = 1024
  cv.height = 272
  const cx = cv.getContext('2d')!
  /** Paint the entrance sign with the zoo's name, shrinking the lettering to fit long names. */
  const drawSign = (name: string) => {
    cx.fillStyle = '#27493a'
    cx.fillRect(0, 0, 1024, 272)
    cx.strokeStyle = '#e8d9a8'
    cx.lineWidth = 10
    cx.strokeRect(18, 18, 988, 236)
    cx.fillStyle = '#f2e6bd'
    cx.textAlign = 'center'
    cx.textBaseline = 'middle'
    const text = name.toUpperCase()
    ;(cx as unknown as { letterSpacing: string }).letterSpacing = '12px'
    let size = 104
    do {
      cx.font = `700 ${size}px Georgia, serif`
      size -= 4
    } while (cx.measureText(text).width > 900 && size > 28)
    cx.fillText(text, 524, 140)
  }
  drawSign('Zoo Keeper')
  const tex = new THREE.CanvasTexture(cv)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 8
  const signMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 })
  const signFront = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.9), signMat)
  signFront.position.set(gx, 1.95, gz + 0.06)
  const signBack = signFront.clone()
  signBack.rotation.y = Math.PI
  signBack.position.z = gz - 0.06
  const signCore = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.9, 0.1), wood)
  signCore.position.set(gx, 1.95, gz)
  scene.add(signFront, signBack, signCore)

  // ---- ticket booth (beside the desk tile just inside the gate) ----
  const booth = new THREE.Group()
  booth.position.set(toWorld(BOOTH.x), 0, toWorld(BOOTH.y))
  const part = (geo: THREE.BufferGeometry, color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, mat(color))
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = true
    booth.add(m)
    return m
  }
  part(new THREE.BoxGeometry(0.06, 1.1, 0.9), 0xe9dcc0, 0.42, 0.55, 0) // back wall
  part(new THREE.BoxGeometry(0.9, 1.1, 0.06), 0xe9dcc0, 0, 0.55, 0.42) // side walls
  part(new THREE.BoxGeometry(0.9, 1.1, 0.06), 0xe9dcc0, 0, 0.55, -0.42)
  part(new THREE.BoxGeometry(0.12, 0.08, 0.96), 0x6b4a2e, -0.42, 0.62, 0) // counter
  const roof = part(new THREE.ConeGeometry(0.85, 0.45, 4), 0xb23a3a, 0, 1.33, 0)
  roof.rotation.y = Math.PI / 4
  const clerk = personModel(0x8a2d2d)
  clerk.position.set(0.12, 0.02, 0)
  clerk.rotation.y = -Math.PI / 2
  booth.add(clerk)
  const bc = document.createElement('canvas')
  bc.width = 256
  bc.height = 72
  const bx = bc.getContext('2d')!
  bx.fillStyle = '#27493a'
  bx.fillRect(0, 0, 256, 72)
  bx.strokeStyle = '#e8d9a8'
  bx.lineWidth = 4
  bx.strokeRect(5, 5, 246, 62)
  bx.fillStyle = '#f2e6bd'
  bx.textAlign = 'center'
  bx.textBaseline = 'middle'
  bx.font = '700 38px Georgia, serif'
  bx.fillText('TICKETS', 128, 38)
  const btex = new THREE.CanvasTexture(bc)
  btex.colorSpace = THREE.SRGBColorSpace
  const bsign = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.225),
    new THREE.MeshStandardMaterial({ map: btex }),
  )
  bsign.position.set(-0.47, 0.98, 0)
  bsign.rotation.y = -Math.PI / 2
  booth.add(bsign)
  scene.add(booth)

  // ---- sky ----
  const skyMat = new THREE.ShaderMaterial({
    uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
    vertexShader:
      'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader:
      'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.55)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const dome = new THREE.Mesh(new THREE.SphereGeometry(700, 24, 16), skyMat)
  dome.renderOrder = -2
  dome.frustumCulled = false
  scene.add(dome)

  const starPos = new Float32Array(900)
  for (let i = 0; i < 300; i++) {
    const v = new THREE.Vector3(r() * 2 - 1, r() * 0.95 + 0.05, r() * 2 - 1).normalize().multiplyScalar(650)
    starPos.set([v.x, v.y, v.z], i * 3)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3))
  const starMat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 2,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    fog: false,
    depthWrite: false,
  })
  const stars = new THREE.Points(starGeo, starMat)
  stars.frustumCulled = false
  stars.renderOrder = -1
  scene.add(stars)

  const sunDisc = new THREE.Mesh(
    new THREE.SphereGeometry(22, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff1c4, fog: false }),
  )
  const moonDisc = new THREE.Mesh(
    new THREE.SphereGeometry(14, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xdfe6f5, fog: false }),
  )
  sunDisc.frustumCulled = moonDisc.frustumCulled = false
  scene.add(sunDisc, moonDisc)

  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true, fog: false })
  const clouds: THREE.Group[] = []
  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group()
    for (let j = 0; j < 5; j++) {
      const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), cloudMat)
      p.position.set((j - 2) * 4 + r() * 2, r() * 1.2, r() * 3)
      p.scale.set(3 + r() * 3, 1.6 + r() * 0.8, 2.5 + r() * 1.5)
      c.add(p)
    }
    c.position.set(r() * 500 - 250, 55 + r() * 25, -260 + r() * 360)
    scene.add(c)
    clouds.push(c)
  }

  const C = (h: number) => new THREE.Color(h)
  const nTop = C(0x04071a),
    nBot = C(0x121a38),
    sTop = C(0x35305f),
    sBot = C(0xf2a173),
    dTop = C(0x2f6fc4),
    dBot = C(0xb4d8f0)
  const top = new THREE.Color(),
    bot = new THREE.Color(),
    grey = new THREE.Color()

  return {
    setSign(name: string) {
      drawSign(name)
      tex.needsUpdate = true
    },
    update(dt: number, elev: number, sunDir: THREE.Vector3, cam: THREE.Vector3, overcast = 0) {
      const k1 = sm(elev, -0.25, 0.05),
        k2 = sm(elev, 0.05, 0.4)
      top.copy(nTop).lerp(sTop, k1).lerp(dTop, k2)
      bot.copy(nBot).lerp(sBot, k1).lerp(dBot, k2)
      if (overcast > 0) {
        // grey the sky toward a flat tone of the same brightness
        for (const c of [top, bot]) {
          const l = (c.r + c.g + c.b) / 3
          c.lerp(grey.setRGB(l * 0.9, l * 0.92, l * 0.95), overcast * 0.8)
        }
      }
      skyMat.uniforms.top.value.copy(top)
      skyMat.uniforms.bottom.value.copy(bot)
      if (scene.fog) scene.fog.color.copy(bot)
      dome.position.copy(cam)
      stars.position.copy(cam)
      starMat.opacity = Math.min(1, Math.max(0, -elev * 3))
      sunDisc.position.copy(cam).addScaledVector(sunDir, 600)
      sunDisc.visible = elev > -0.08 && overcast < 0.6
      moonDisc.position.copy(cam).addScaledVector(sunDir, -600)
      moonDisc.visible = elev < 0.08
      cloudMat.color.setScalar(0.18 + 0.82 * sm(elev, -0.1, 0.35))
      for (const c of clouds) {
        c.position.x += dt * 1.6
        if (c.position.x > 280) c.position.x = -280
      }
      const night = 1 - sm(elev, -0.05, 0.25)
      lanternMat.emissiveIntensity = night * 2.2
      for (const l of lights) l.intensity = night * 22
    },
  }
}
