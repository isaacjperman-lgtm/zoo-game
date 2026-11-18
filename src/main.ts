import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Game } from './game'
import { N, T_GRASS, T_PATH, T_PEN, toWorld, toTile, inBounds } from './config'
import { SPECIES } from './data/species'
import { animateRig } from './entities/models'
import { createEnvironment } from './world/environment'
import { createHud } from './ui/hud'
import { makeThumbnails } from './ui/thumbs'

const game = new Game()
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game // for debugging in the console
const loaded = game.load()

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.95
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
scene.fog = new THREE.Fog(0xb4d8f0, 70, 260)
scene.add(game.root)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1500)
camera.position.set(0, 24, 42)
const controls = new OrbitControls(camera, renderer.domElement)
controls.mouseButtons = {
  LEFT: -1 as unknown as THREE.MOUSE,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.ROTATE,
}
controls.maxPolarAngle = Math.PI / 2.15
controls.minDistance = 6
controls.maxDistance = 90
controls.enableDamping = true
controls.dampingFactor = 0.08
controls.target.set(0, 0, 12)

const sun = new THREE.DirectionalLight(0xffffff, 3)
sun.castShadow = true
sun.shadow.mapSize.set(2048, 2048)
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 200 })
sun.shadow.bias = -0.0004
sun.shadow.normalBias = 0.03
scene.add(sun, sun.target)
const hemi = new THREE.HemisphereLight(0xbfdfff, 0x4a5a3a, 0.6)
scene.add(hemi)

const env = createEnvironment(scene)

// ---------- terrain ----------
const tileMesh = new THREE.InstancedMesh(
  new THREE.BoxGeometry(1, 0.1, 1),
  new THREE.MeshStandardMaterial({ roughness: 0.95 }),
  N * N,
)
tileMesh.receiveShadow = true
scene.add(tileMesh)
const penMat = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.7, metalness: 0.2 })
const railMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.04), penMat, N * N * 8)
const postMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.5, 0.07), penMat, N * N * 8)
railMesh.castShadow = postMesh.castShadow = true
scene.add(railMesh, postMesh)

const col = new THREE.Color(),
  dummy = new THREE.Object3D()
const noise = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
function rebuildTiles() {
  let nr = 0,
    np = 0
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = game.tile(x, y),
        i = y * N + x,
        n = noise(x, y)
      dummy.position.set(toWorld(x), t === T_PATH ? 0.01 : 0, toWorld(y))
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(
        t === T_PATH ? 0.95 : 1,
        t === T_PATH ? 1.4 : t === T_PEN ? 0.9 : 1,
        t === T_PATH ? 0.95 : 1,
      )
      dummy.updateMatrix()
      tileMesh.setMatrixAt(i, dummy.matrix)
      if (t === T_PATH) col.setHSL(0.11, 0.3, 0.5 + n * 0.07)
      else if (t === T_PEN) col.setHSL(0.09, 0.4, 0.36 + n * 0.05)
      else col.setHSL(0.27 + n * 0.02, 0.5, 0.25 + n * 0.04 + ((x + y) & 1) * 0.02)
      tileMesh.setColorAt(i, col)
      if (t !== T_PEN) continue
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        if (game.tile(x + dx, y + dy) === T_PEN) continue
        const cx = toWorld(x) + dx * 0.49,
          cz = toWorld(y) + dy * 0.49
        for (const h of [0.17, 0.36]) {
          dummy.position.set(cx, h, cz)
          dummy.rotation.set(0, dx ? Math.PI / 2 : 0, 0)
          dummy.scale.set(1, 1, 1)
          dummy.updateMatrix()
          railMesh.setMatrixAt(nr++, dummy.matrix)
        }
        for (const e of [-0.5, 0.5]) {
          dummy.position.set(cx + (dx ? 0 : e), 0.25, cz + (dx ? e : 0))
          dummy.rotation.set(0, 0, 0)
          dummy.updateMatrix()
          postMesh.setMatrixAt(np++, dummy.matrix)
        }
      }
    }
  railMesh.count = nr
  postMesh.count = np
  tileMesh.instanceMatrix.needsUpdate = true
  if (tileMesh.instanceColor) tileMesh.instanceColor.needsUpdate = true
  railMesh.instanceMatrix.needsUpdate = postMesh.instanceMatrix.needsUpdate = true
}
game.onTilesChanged = rebuildTiles
rebuildTiles()

// ---------- UI ----------
let speed = 1
const hud = createHud(game, makeThumbnails(), {
  speed: (n) => {
    speed = n
  },
  save: () => game.save(),
  reset: () => game.reset(),
})
game.onMessage = (m) => hud.toast(m)
if (!loaded) hud.toast('Build a path from the gate, add an enclosure, then buy an animal.')

// ---------- input ----------
const cursor = new THREE.Group()
const cursorFill = new THREE.Mesh(
  new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.3, depthWrite: false }),
)
const cursorEdge = new THREE.LineSegments(
  new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2)),
  new THREE.LineBasicMaterial({ transparent: true, opacity: 0.95 }),
)
cursor.add(cursorFill, cursorEdge)
scene.add(cursor)
const ray = new THREE.Raycaster(),
  mouse = new THREE.Vector2(),
  plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
let down = false,
  lastX = 0,
  lastY = 0,
  hoverTile: { x: number; y: number } | null = null
function pick(e: PointerEvent) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(mouse, camera)
  const p = new THREE.Vector3()
  if (!ray.ray.intersectPlane(plane, p)) return null
  const x = toTile(p.x),
    y = toTile(p.z)
  return inBounds(x, y) ? { x, y } : null
}
function use(t: { x: number; y: number }, drag: boolean) {
  const tool = hud.tool
  if (tool === 'path') game.paint(t.x, t.y, T_PATH)
  else if (tool === 'pen') game.paint(t.x, t.y, T_PEN)
  else if (tool === 'clear') game.paint(t.x, t.y, T_GRASS)
  else if (drag) return
  else if (tool === 'feed') game.feedAt(t.x, t.y)
  else if (tool.startsWith('a:'))
    game.buyAnimal(
      SPECIES.find((s) => 'a:' + s.id === tool)!,
      t.x,
      t.y,
    )
}
const cv = renderer.domElement
cv.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  down = true
  const t = pick(e)
  if (t) use(t, false)
})
addEventListener('pointerup', () => (down = false))
cv.addEventListener('pointermove', (e) => {
  lastX = e.clientX
  lastY = e.clientY
  hoverTile = pick(e)
  if (hoverTile && down) use(hoverTile, true)
})
cv.addEventListener('pointerleave', () => (hoverTile = null))
cv.addEventListener('contextmenu', (e) => e.preventDefault())
const keys = new Set<string>()
addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase())
  if (e.key === ' ') {
    speed = speed === 0 ? 1 : 0
    e.preventDefault()
  } else if ('123'.includes(e.key) && e.key) speed = +e.key
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// ---------- loop ----------
const clock = new THREE.Clock()
let saveT = 0
const sunDir = new THREE.Vector3(),
  fwd = new THREE.Vector3(),
  up = new THREE.Vector3(0, 1, 0)
function frame() {
  const real = Math.min(clock.getDelta(), 0.1),
    t = clock.elapsedTime
  game.update(real * speed)

  // camera pan
  const mx = +(keys.has('d') || keys.has('arrowright')) - +(keys.has('a') || keys.has('arrowleft'))
  const mz = +(keys.has('s') || keys.has('arrowdown')) - +(keys.has('w') || keys.has('arrowup'))
  if (mx || mz) {
    camera.getWorldDirection(fwd)
    fwd.y = 0
    fwd.normalize()
    const d = new THREE.Vector3()
      .crossVectors(fwd, up)
      .multiplyScalar(mx)
      .addScaledVector(fwd, -mz)
      .multiplyScalar(22 * real)
    camera.position.add(d)
    controls.target.add(d)
  }
  controls.update()

  // sun cycle
  const a = game.time * Math.PI * 2,
    elev = Math.sin(a)
  sunDir.set(Math.cos(a) * 0.8, Math.max(Math.abs(elev), 0.05) * (elev < 0 ? -1 : 1), 0.4).normalize()
  sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position)
  const dayK = THREE.MathUtils.smoothstep(elev, -0.05, 0.2)
  if (elev < 0) sun.position.set(-sunDir.x * 60, 60, 25) // moonlight comes from the opposite side
  sun.intensity = elev > 0 ? Math.min(1, elev * 4) * 3.2 : (1 - dayK) * 0.9
  sun.color.setHSL(elev > 0 ? 0.1 : 0.62, elev < 0.3 ? (elev > 0 ? 0.75 : 0.5) : 0.15, elev > 0 ? 0.9 : 0.75)
  hemi.intensity = 0.7 - dayK * 0.2
  hemi.color.setHSL(0.58, 0.6, 0.6 + dayK * 0.3)
  env.update(real, elev, sunDir, camera.position)

  // animation
  for (const an of game.animals) animateRig(an.group, t + an.tx, !!an.target, real)
  for (const v of game.visitors) animateRig(v.group, t, v.state !== 'watching' && v.path.length > 0, real)
  for (const k of game.keepers) animateRig(k.group, t, !!k.target, real)

  // cursor + hover info
  cursor.visible = !!hoverTile
  if (hoverTile) {
    cursor.position.set(toWorld(hoverTile.x), 0.075, toWorld(hoverTile.y))
    const c =
      hud.tool === 'clear' ? 0xff7a6e : hud.tool === 'feed' || hud.tool.startsWith('a:') ? 0xffd36a : 0x9fe8ae
    ;(cursorFill.material as THREE.MeshBasicMaterial).color.set(c)
    ;(cursorEdge.material as THREE.LineBasicMaterial).color.set(c)
  }
  const over = hoverTile
    ? (game.animals.find((an) => an.tx === hoverTile!.x && an.ty === hoverTile!.y) ?? null)
    : null
  hud.showAnimal(over, lastX, lastY)
  hud.update(speed)

  if ((saveT += real) > 10) {
    saveT = 0
    game.save()
  }
  renderer.render(scene, camera)
  requestAnimationFrame(frame)
}
frame()
addEventListener('beforeunload', () => game.save())
