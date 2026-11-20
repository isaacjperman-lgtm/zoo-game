import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Game } from './game'
import { N, T_GRASS, T_PATH, T_PEN, T_BOOTH, toWorld, toTile, inBounds } from './config'
import { SPECIES } from './data/species'
import { animateRig } from './entities/models'
import { createEnvironment } from './world/environment'
import { createHud } from './ui/hud'
import { makeThumbnails } from './ui/thumbs'
import { sound } from './ui/sound'
import { createFirstPerson } from './ui/firstPerson'
import { lampMat, lampGlowMat, stageLightMat } from './entities/props'
import type { Animal } from './entities/animal'
import type { Keeper } from './entities/people'

const game = new Game()
if (import.meta.env.DEV) (window as unknown as { game: Game }).game = game // for debugging in the console
const loaded = game.load()

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true })
const maxRatio = Math.min(devicePixelRatio, 2)
let ratio = Math.min(maxRatio, 1.75) // hi-dpi screens start a little under full resolution
renderer.setPixelRatio(ratio)
renderer.setSize(innerWidth, innerHeight)
renderer.shadowMap.enabled = true
renderer.shadowMap.autoUpdate = false // refreshed every other frame, see optimizeShadows
renderer.shadowMap.needsUpdate = true
renderer.shadowMap.type = THREE.PCFSoftShadowMap
renderer.toneMapping = THREE.ACESFilmicToneMapping
renderer.toneMappingExposure = 0.95
document.body.prepend(renderer.domElement)

const scene = new THREE.Scene()
if (import.meta.env.DEV) (window as unknown as { renderer: THREE.WebGLRenderer }).renderer = renderer // for debugging in the console
scene.fog = new THREE.Fog(0xb4d8f0, 70, 260)
scene.add(game.root)
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 1500)
if (import.meta.env.DEV) (window as unknown as { camera: THREE.Camera }).camera = camera // for debugging in the console
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
const gateGroup = new THREE.Group()
scene.add(gateGroup)
// Gates are painted cream with gold caps and a lintel, so a closed one still stands out from the brown fence.
const gateWood = new THREE.MeshStandardMaterial({ color: 0xf1e4c3, roughness: 0.6 })
const gatePostMat = new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.6 })
const gateGold = new THREE.MeshStandardMaterial({ color: 0xe2b23c, roughness: 0.35, metalness: 0.4 })
const gatePostGeo = new THREE.BoxGeometry(0.12, 0.9, 0.12)
const gateCapGeo = new THREE.SphereGeometry(0.085, 10, 8)
const gateLintelGeo = new THREE.BoxGeometry(1.02, 0.07, 0.08)
const gateLeafGeo = new THREE.BoxGeometry(0.4, 0.4, 0.05)
const gateBraceGeo = new THREE.BoxGeometry(0.46, 0.04, 0.03)

const col = new THREE.Color(),
  dummy = new THREE.Object3D()
const noise = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453
  return s - Math.floor(s)
}
/** A closed gate on a tile edge: two posts with a door leaf hinged on each. Leaves swing into the pen to open. */
interface GateRig {
  x: number
  z: number
  open: number // 0 closed .. 1 open
  left: THREE.Object3D
  right: THREE.Object3D
}
const gates: GateRig[] = []
function addGate(cx: number, cz: number, dx: number, dy: number) {
  const g = new THREE.Group()
  g.position.set(cx, 0, cz)
  g.rotation.y = Math.atan2(dx, dy) // local +z points out toward the path
  const hinges: THREE.Group[] = []
  for (const e of [-1, 1]) {
    const post = new THREE.Mesh(gatePostGeo, gatePostMat)
    post.position.set(e * 0.5, 0.45, 0)
    post.castShadow = true
    const cap = new THREE.Mesh(gateCapGeo, gateGold)
    cap.position.set(e * 0.5, 0.94, 0)
    const hinge = new THREE.Group()
    hinge.position.set(e * 0.45, 0.3, 0)
    const leaf = new THREE.Mesh(gateLeafGeo, gateWood)
    leaf.position.set(-e * 0.2, 0, 0)
    leaf.castShadow = true
    const brace = new THREE.Mesh(gateBraceGeo, gateGold) // a diagonal brace across the door
    brace.position.set(-e * 0.2, 0, e * 0.02)
    brace.rotation.z = e * 0.75
    hinge.add(leaf, brace)
    g.add(post, cap, hinge)
    hinges.push(hinge)
  }
  const lintel = new THREE.Mesh(gateLintelGeo, gatePostMat)
  lintel.position.set(0, 0.84, 0)
  lintel.castShadow = true
  g.add(lintel)
  gateGroup.add(g)
  gates.push({ x: cx, z: cz, open: 0, left: hinges[0], right: hinges[1] })
}
/** Gates stay shut until a keeper walks up to one, swing open for them, then close behind them. */
function animateGates(dt: number) {
  for (const gt of gates) {
    const near = game.keepers.some(
      (k) => Math.hypot(k.group.position.x - gt.x, k.group.position.z - gt.z) < 1.1,
    )
    gt.open += ((near ? 1 : 0) - gt.open) * Math.min(1, dt * 8)
    const ang = gt.open * 1.5
    gt.left.rotation.y = ang
    gt.right.rotation.y = -ang
  }
}
function rebuildTiles() {
  let nr = 0,
    np = 0
  gateGroup.clear()
  gates.length = 0
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const t = game.tile(x, y),
        paved = t === T_PATH || t === T_BOOTH,
        i = y * N + x,
        n = noise(x, y)
      dummy.position.set(toWorld(x), paved ? 0.01 : 0, toWorld(y))
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(paved ? 0.95 : 1, paved ? 1.4 : t === T_PEN ? 0.9 : 1, paved ? 0.95 : 1)
      dummy.updateMatrix()
      tileMesh.setMatrixAt(i, dummy.matrix)
      if (paved) col.setHSL(0.11, 0.3, 0.5 + n * 0.07)
      else if (t === T_PEN)
        col.setHSL(0.11, game.gates.has(i) ? 0.3 : 0.4, (game.gates.has(i) ? 0.6 : 0.36) + n * 0.04)
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
        if (game.gates.has(i) && game.tile(x + dx, y + dy) === T_PATH) {
          addGate(toWorld(x) + dx * 0.49, toWorld(y) + dy * 0.49, dx, dy)
          continue
        }
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
// Painting a drag of tiles fires this many times per frame; the terrain is rebuilt once, in the frame loop.
let tilesDirty = false
game.onTilesChanged = () => (tilesDirty = true)
rebuildTiles()

// ---------- UI ----------
let speed = 1
const hud = createHud(game, makeThumbnails(), {
  speed: (n) => {
    speed = n
  },
  save: () => game.save(),
  reset: () => game.reset(),
  photo: () => fp.toggle(),
  rename: (name) => {
    env.setSign(name)
    document.title = name
  },
})
game.onMessage = (m) => {
  hud.toast(m)
  if (/^(not enough|clear the building|something is already|buildings go|animals need)/i.test(m))
    sound.error()
}
game.onSound = (n) => (n === 'goal' ? sound.goal() : sound.build())
const proj = new THREE.Vector3()
game.onIncome = (x, z, amount) => {
  proj.set(x, 1.1, z).project(camera)
  hud.floatText((proj.x * 0.5 + 0.5) * innerWidth, (-proj.y * 0.5 + 0.5) * innerHeight, '+$' + amount)
  sound.coin()
}
env.setSign(game.zooName)
document.title = game.zooName
if (!loaded) hud.showTitle()
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
const ground = new THREE.Vector3() // where the last pick hit the ground
function pick(e: PointerEvent) {
  mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
  ray.setFromCamera(mouse, camera)
  const p = new THREE.Vector3()
  if (!ray.ray.intersectPlane(plane, p)) return null
  ground.copy(p)
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
  else if (tool.startsWith('b:')) game.placeProp(tool.slice(2), t.x, t.y)
  else if (tool.startsWith('a:'))
    game.buyAnimal(
      SPECIES.find((s) => 'a:' + s.id === tool)!,
      t.x,
      t.y,
    )
}
const cv = renderer.domElement
/** The animal or keeper under the pointer: a hit on a model, or failing that the animal on that tile. */
function entityAt(t: { x: number; y: number } | null): Animal | Keeper | null {
  const hit = ray.intersectObjects(
    [...game.animals.map((a) => a.group), ...game.keepers.map((k) => k.group)],
    true,
  )[0]
  if (hit)
    for (let o: THREE.Object3D | null = hit.object; o; o = o.parent) {
      const found = game.animals.find((an) => an.group === o) ?? game.keepers.find((k) => k.group === o)
      if (found) return found
    }
  // people are thin, so also accept anyone standing close to where the pointer hit the ground
  let best: Animal | Keeper | null = null
  let bestD = 0.6
  for (const e of [...game.keepers, ...game.animals]) {
    const d = Math.hypot(e.group.position.x - ground.x, e.group.position.z - ground.z)
    if (d < bestD) {
      best = e
      bestD = d
    }
  }
  if (best) return best
  return t ? (game.animals.find((an) => an.tx === t.x && an.ty === t.y) ?? null) : null
}
let rightDown: { x: number; y: number } | null = null
cv.addEventListener('pointerdown', (e) => {
  if (fp.active) return
  if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY } // a right click inspects; a right drag orbits
  if (e.button !== 0) return
  down = true
  const t = pick(e)
  if (t) use(t, false)
})
cv.addEventListener('pointerup', (e) => {
  if (fp.active) return
  if (e.button !== 2 || !rightDown) return
  const moved = Math.hypot(e.clientX - rightDown.x, e.clientY - rightDown.y)
  rightDown = null
  if (moved > 5) return // it was an orbit drag
  const t = pick(e)
  hud.select(entityAt(t)) // right-click an animal or keeper to inspect it, anywhere else to let go
})
addEventListener('pointerup', () => (down = false))
cv.addEventListener('pointermove', (e) => {
  if (fp.active) return
  lastX = e.clientX
  lastY = e.clientY
  hoverTile = pick(e)
  if (hoverTile && down) use(hoverTile, true)
})
cv.addEventListener('pointerleave', () => (hoverTile = null))
cv.addEventListener('contextmenu', (e) => e.preventDefault())
const keys = new Set<string>()
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return // typing in a text field
  keys.add(e.key.toLowerCase())
  const key = e.key.toLowerCase()
  if (fp.active && (key === 'escape' || key === 'p')) return fp.exit()
  if (fp.active && (key === 'enter' || key === 'f')) return fp.shoot()
  if (e.key === 'Escape') {
    hud.tool = ''
    hud.escape()
  } else if (key === 'p') fp.enter()
  else if (e.key === ' ') {
    speed = speed === 0 ? 1 : 0
    e.preventDefault()
  } else if ('123'.includes(e.key) && e.key) speed = +e.key
})
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()))
const fp = createFirstPerson({
  camera,
  canvas: renderer.domElement,
  controls,
  game,
  keys,
  root: document.getElementById('ui')!,
  shutter: takePhoto,
  onChange: (on) => {
    hud.tool = ''
    hud.select(null)
    if (on) hud.toast('Photo mode: walk around and take a picture')
  },
})
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(innerWidth, innerHeight)
})

// ---------- performance ----------
// If frames take too long the picture is rendered at a lower resolution, and it creeps back up when there is
// headroom. ?fixedres in the address turns this off (useful when measuring).
const fixedRes = location.search.includes('fixedres')
let frameAvg = 1 / 60,
  slowFor = 0,
  fastFor = 0,
  adaptCooldown = 2
function setRatio(r: number) {
  ratio = r
  renderer.setPixelRatio(ratio)
  renderer.setSize(innerWidth, innerHeight)
}
function adaptResolution(dt: number) {
  frameAvg += (dt - frameAvg) * 0.05
  if (fixedRes || (adaptCooldown -= dt) > 0) return
  if (frameAvg > 1 / 40) ((slowFor += dt), (fastFor = 0))
  else if (frameAvg < 1 / 56) ((fastFor += dt), (slowFor = 0))
  else slowFor = fastFor = 0
  if (slowFor > 1.5 && ratio > 0.7) {
    setRatio(Math.max(0.7, ratio - 0.15))
    slowFor = 0
    adaptCooldown = 2
  } else if (fastFor > 5 && ratio < maxRatio) {
    setRatio(Math.min(maxRatio, ratio + 0.1))
    fastFor = 0
    adaptCooldown = 3
  }
}
// Shadows are the most expensive part of the picture, since every caster is drawn a second time. They refresh every
// other frame (the sun moves slowly), and guests far from the camera, whose shadows would be a few pixels, don't
// cast one at all.
let shadowFrame = 0,
  shadowLodT = 0
function optimizeShadows(dt: number) {
  renderer.shadowMap.needsUpdate = (shadowFrame++ & 1) === 0
  if ((shadowLodT -= dt) > 0) return
  shadowLodT = 0.3
  const c = camera.position
  for (const v of game.visitors) {
    const d = Math.hypot(v.group.position.x - c.x, v.group.position.y - c.y, v.group.position.z - c.z)
    const want = v.shadowOn ? d < 40 : d < 32 // a little hysteresis so they don't flicker at the edge
    if (want !== v.shadowOn) {
      v.shadowOn = want
      v.group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = want
      })
    }
  }
}

// ---------- photo mode ----------
const flash = document.createElement('div')
flash.className = 'flash'
document.body.append(flash)
/** Save what the camera sees (without the interface) as a PNG with the zoo's name in the corner. */
function takePhoto(): string {
  // draw now at full resolution with fresh shadows, so the canvas holds a good frame
  if (ratio !== maxRatio) {
    renderer.setPixelRatio(maxRatio)
    renderer.setSize(innerWidth, innerHeight)
  }
  renderer.shadowMap.needsUpdate = true
  renderer.render(scene, camera)
  const src = renderer.domElement
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const x = c.getContext('2d')!
  x.drawImage(src, 0, 0)
  const size = Math.round(c.height * 0.035)
  x.font = `700 ${size}px Georgia, serif`
  x.textBaseline = 'bottom'
  x.shadowColor = 'rgba(0,0,0,0.7)'
  x.shadowBlur = size * 0.3
  x.fillStyle = 'rgba(255,255,255,0.95)'
  x.fillText(`${game.zooName} · Day ${game.day}`, size, c.height - size * 0.8)
  if (ratio !== maxRatio) setRatio(ratio) // back to the working resolution
  c.toBlob((blob) => {
    if (!blob) return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${game.zooName.replace(/[^\w]+/g, '-')}-day-${game.day}.png`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  })
  flash.classList.remove('go')
  void flash.offsetWidth
  flash.classList.add('go')
  sound.click()
  hud.toast('Photo saved')
  // a small preview for the viewfinder
  const t = document.createElement('canvas')
  t.width = 240
  t.height = Math.round((240 * c.height) / c.width)
  t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height)
  return t.toDataURL('image/jpeg', 0.7)
}

// ---------- loop ----------
const clock = new THREE.Clock()
let saveT = 0
const sunDir = new THREE.Vector3(),
  fwd = new THREE.Vector3(),
  up = new THREE.Vector3(0, 1, 0)
// ---------- lamp light ----------
// Every lamp paints a glow on the ground (cheap, always on at night); the few nearest the camera also get a real
// point light, so animals, guests and trees around them are lit too.
const LAMP_LIGHTS = 8
const lampLights = Array.from({ length: LAMP_LIGHTS }, () => {
  const l = new THREE.PointLight(0xffc880, 0, 9, 1.6)
  scene.add(l)
  return l
})
let lampList: { group: THREE.Group }[] = []
let lampT = 0
function updateLampLight(night: number, dt: number) {
  lampGlowMat.opacity = night * 0.65
  if (night < 0.02) {
    for (const l of lampLights) l.intensity = 0
    return
  }
  // choosing the nearest lamps is done a few times a second, not every frame
  if ((lampT -= dt) <= 0) {
    lampT = 0.25
    const c = fp.active ? fp.position : controls.target
    lampList = [...game.props.values()]
      .filter((p) => p.id === 'lamp')
      .sort(
        (a, b) =>
          Math.hypot(a.group.position.x - c.x, a.group.position.z - c.z) -
          Math.hypot(b.group.position.x - c.x, b.group.position.z - c.z),
      )
    lampLights.forEach((l, i) => {
      const lamp = lampList[i]
      if (lamp) l.position.set(lamp.group.position.x, 1.5, lamp.group.position.z)
    })
  }
  lampLights.forEach((l, i) => (l.intensity = lampList[i] ? night * 6 : 0))
}
// ---------- weather ----------
const RAIN = 3200
const rainPos = new Float32Array(RAIN * 6)
const rainBase = new Float32Array(RAIN * 3)
for (let i = 0; i < RAIN; i++) {
  rainBase[i * 3] = (Math.random() - 0.5) * 44
  rainBase[i * 3 + 1] = Math.random() * 22
  rainBase[i * 3 + 2] = (Math.random() - 0.5) * 44
}
const rainGeo = new THREE.BufferGeometry()
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3))
const rainMat = new THREE.LineBasicMaterial({
  color: 0xbcd0e6,
  transparent: true,
  opacity: 0,
  depthWrite: false,
})
const rain = new THREE.LineSegments(rainGeo, rainMat)
rain.frustumCulled = false
scene.add(rain)
let overcast = 0, // 0 clear .. ~0.9 downpour, eased so weather fades in and out
  rainK = 0
const stormGrey = new THREE.Color()
function updateWeather(dt: number) {
  const w = game.weather
  overcast += ((w === 'sunny' ? 0 : w === 'cloudy' ? 0.45 : 0.9) - overcast) * Math.min(1, dt * 0.7)
  rainK += ((w === 'rain' ? 1 : 0) - rainK) * Math.min(1, dt * 0.9)
  rain.visible = rainK > 0.02
  if (!rain.visible) return
  rainMat.opacity = rainK * 0.75
  const rc = fp.active ? fp.position : controls.target
  rain.position.set(rc.x, 0, rc.z)
  for (let i = 0; i < RAIN; i++) {
    let y = rainBase[i * 3 + 1] - 30 * dt
    if (y < 0) y += 22
    rainBase[i * 3 + 1] = y
    const x = rainBase[i * 3],
      z = rainBase[i * 3 + 2]
    const o = i * 6
    rainPos[o] = x
    rainPos[o + 1] = y
    rainPos[o + 2] = z
    rainPos[o + 3] = x - 0.08
    rainPos[o + 4] = y + 0.9
    rainPos[o + 5] = z
  }
  rainGeo.attributes.position.needsUpdate = true
}

// Selecting an animal glides the camera in and keeps it centered until the player pans away.
let followed: unknown = null,
  zoomLeft = 0
const focus = new THREE.Vector3(),
  rel = new THREE.Vector3()
function followSelected(dt: number) {
  const a = hud.focus
  if (a?.group !== followed) {
    followed = a?.group
    zoomLeft = a ? 1.4 : 0
  }
  if (!a) return
  focus.copy(a.group.position)
  focus.y += a.size * 0.9
  const k = 1 - Math.exp(-dt * 6)
  rel.copy(camera.position).sub(controls.target)
  controls.target.lerp(focus, k)
  if (zoomLeft > 0) {
    zoomLeft -= dt
    const want = 4 + a.size * 6 + a.neck * 3
    rel.setLength(THREE.MathUtils.lerp(rel.length(), want, k))
  }
  camera.position.copy(controls.target).add(rel)
}
function frame() {
  const real = Math.min(clock.getDelta(), 0.1),
    t = clock.elapsedTime
  game.update(real * speed)
  if (tilesDirty) {
    tilesDirty = false
    rebuildTiles()
  }
  animateGates(real)
  adaptResolution(real)
  optimizeShadows(real)

  // camera pan
  const mx = fp.active
    ? 0
    : +(keys.has('d') || keys.has('arrowright')) - +(keys.has('a') || keys.has('arrowleft'))
  const mz = fp.active
    ? 0
    : +(keys.has('s') || keys.has('arrowdown')) - +(keys.has('w') || keys.has('arrowup'))
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
    hud.select(null) // panning away lets go of the animal
  }
  if (fp.active) fp.update(real)
  else {
    followSelected(real)
    controls.update()
  }

  // sun cycle
  const a = game.time * Math.PI * 2,
    elev = Math.sin(a)
  sunDir.set(Math.cos(a) * 0.8, Math.max(Math.abs(elev), 0.05) * (elev < 0 ? -1 : 1), 0.4).normalize()
  sun.position.copy(sunDir).multiplyScalar(80).add(sun.target.position)
  const dayK = THREE.MathUtils.smoothstep(elev, -0.05, 0.2)
  if (elev < 0) sun.position.set(-sunDir.x * 60, 60, 25) // moonlight comes from the opposite side
  sun.intensity = elev > 0 ? Math.min(1, elev * 4) * 3.2 : (1 - dayK) * 0.9
  sun.color.setHSL(elev > 0 ? 0.1 : 0.62, elev < 0.3 ? (elev > 0 ? 0.75 : 0.5) : 0.15, elev > 0 ? 0.9 : 0.75)
  lampMat.emissiveIntensity = (1 - dayK) * 3
  updateLampLight(1 - dayK, real)
  hemi.intensity = 0.7 - dayK * 0.2
  hemi.color.setHSL(0.58, 0.6, 0.6 + dayK * 0.3)
  updateWeather(real)
  sun.intensity *= 1 - 0.55 * overcast
  hemi.intensity *= 1 - 0.1 * overcast
  env.update(real, elev, sunDir, camera.position, overcast)
  if (scene.fog) {
    const l = (scene.fog.color.r + scene.fog.color.g + scene.fog.color.b) / 3
    scene.fog.color.lerp(stormGrey.setRGB(l, l, l), overcast * 0.5)
  }

  // props: fountain spray, and the stage comes alive during a show
  const showOn = game.showActive > 0
  stageLightMat.emissiveIntensity +=
    ((showOn ? 3 : 0.15) - stageLightMat.emissiveIntensity) * Math.min(1, real * 4)
  for (const p of game.props.values()) {
    const spray = p.group.userData.spray as THREE.Object3D | undefined
    if (spray) spray.scale.y = 0.85 + Math.sin(t * 5 + p.x) * 0.18
    const performer = p.group.userData.performer as THREE.Group | undefined
    if (performer) {
      performer.position.y = 0.1 + (showOn ? Math.abs(Math.sin(t * 6)) * 0.09 : 0)
      performer.rotation.y = showOn ? Math.sin(t * 2) * 0.6 : 0
      animateRig(performer, t, showOn, real)
    }
  }

  // animation
  for (const an of game.animals) animateRig(an.group, t + an.tx, !!an.target, real)
  for (const v of game.visitors) animateRig(v.group, t, v.moving, real)
  for (const k of game.keepers) animateRig(k.group, t, k.moving, real)

  // cursor + hover info
  cursor.visible = !fp.active && !!hoverTile && hud.tool !== ''
  if (hoverTile) {
    cursor.position.set(toWorld(hoverTile.x), 0.075, toWorld(hoverTile.y))
    const c =
      hud.tool === 'clear' ? 0xff7a6e : hud.tool === 'feed' || hud.tool.startsWith('a:') ? 0xffd36a : 0x9fe8ae
    ;(cursorFill.material as THREE.MeshBasicMaterial).color.set(c)
    ;(cursorEdge.material as THREE.LineBasicMaterial).color.set(c)
  }
  const over =
    hoverTile && !fp.active
      ? (game.animals.find((an) => an.tx === hoverTile!.x && an.ty === hoverTile!.y) ?? null)
      : null
  hud.showAnimal(over === hud.selected ? null : over, lastX, lastY)
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
