import * as THREE from 'three'
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Game } from '../game'
import { N, T_BOOTH, T_PEN, idx, toWorld, toTile, ENTRANCE } from '../config'

const EYE = 0.62 // eye height in world units (a guest is about 0.7 tall)
const WALK = 2.4
const RUN = 5
const RADIUS = 0.2

interface Options {
  camera: THREE.PerspectiveCamera
  canvas: HTMLCanvasElement
  controls: OrbitControls
  game: Game
  keys: Set<string>
  root: HTMLElement
  /** Take the photo (draws the canvas and saves it). Returns a small preview image. */
  shutter: () => string | undefined
  onChange: (on: boolean) => void
}

/**
 * Photo mode: leave the overview camera and walk around the zoo at eye level. WASD to walk (Shift to run), mouse to
 * look (the pointer is captured; if the browser won't allow that, drag instead), scroll to zoom the lens, and
 * click, Enter or F to take a photo. Esc leaves. The zoo keeps running, so you can catch things as they happen.
 */
export function createFirstPerson(o: Options) {
  const { camera, canvas, controls, game, keys } = o
  let active = false,
    locked = false,
    dragging = false,
    yaw = 0,
    pitch = 0,
    fov = 62,
    photos = 0,
    bobT = 0
  const saved = { pos: new THREE.Vector3(), target: new THREE.Vector3(), fov: 45, near: 0.1 }
  const pos = new THREE.Vector2()

  const ui = document.createElement('div')
  ui.className = 'fp-ui'
  ui.innerHTML = `
    <div class="fp-frame"><i></i><i></i><i></i><i></i></div>
    <div class="fp-cross"></div>
    <div class="fp-hint">WASD walk · Shift run · look around with the mouse · scroll to zoom · click, Enter or F for a photo · Esc to leave</div>
    <button class="fp-shutter" aria-label="Take photo" title="Take photo (click, Enter or F)"></button>
    <div class="fp-count"></div>
    <img class="fp-thumb" alt="Last photo" />`
  o.root.append(ui)
  const thumb = ui.querySelector<HTMLImageElement>('.fp-thumb')!
  const count = ui.querySelector<HTMLElement>('.fp-count')!
  let thumbTimer = 0

  /** Can a person stand here? Not in a pen (except in its gateway), the ticket booth, a building, or outside the fence. */
  function canStand(x: number, z: number) {
    const lim = N / 2 - 0.35
    if (Math.abs(x) > lim || Math.abs(z) > lim) return false
    const tx = toTile(x),
      ty = toTile(z)
    const t = game.tile(tx, ty)
    if (t === T_BOOTH) return false
    if (t === T_PEN && !game.gates.has(idx(tx, ty))) return false
    return !game.props.has(idx(tx, ty))
  }
  const fits = (x: number, z: number) =>
    canStand(x - RADIUS, z - RADIUS) &&
    canStand(x + RADIUS, z - RADIUS) &&
    canStand(x - RADIUS, z + RADIUS) &&
    canStand(x + RADIUS, z + RADIUS)

  function look(dx: number, dy: number) {
    // browsers occasionally report one huge jump when the pointer is captured; ignore the excess
    const c = (v: number) => Math.max(-150, Math.min(150, v))
    yaw -= c(dx) * 0.0022
    pitch = Math.max(-1.35, Math.min(1.35, pitch - c(dy) * 0.0022))
  }

  function enter() {
    if (active) return
    active = true
    saved.pos.copy(camera.position)
    saved.target.copy(controls.target)
    saved.fov = camera.fov
    saved.near = camera.near
    controls.enabled = false
    // start on the walkable spot nearest to where the overview camera was looking, facing that way
    const cx = controls.target.x,
      cz = controls.target.z
    let best: [number, number] | null = null
    let bestD = Infinity
    for (let ty = 0; ty < N; ty++)
      for (let tx = 0; tx < N; tx++) {
        const x = toWorld(tx),
          z = toWorld(ty)
        const d = Math.hypot(x - cx, z - cz)
        if (d < bestD && fits(x, z)) {
          bestD = d
          best = [x, z]
        }
      }
    const [sx, sz] = best ?? [toWorld(ENTRANCE.x), toWorld(ENTRANCE.y - 2)]
    pos.set(sx, sz)
    yaw = bestD > 0.5 ? Math.atan2(sx - cx, sz - cz) : 0
    pitch = -0.05
    camera.rotation.order = 'YXZ'
    camera.fov = fov
    camera.near = 0.05
    camera.updateProjectionMatrix()
    document.body.classList.add('fp')
    ui.classList.add('on')
    count.textContent = photos ? `${photos} photo${photos === 1 ? '' : 's'} taken` : ''
    try {
      canvas.requestPointerLock?.()
    } catch {
      /* dragging works instead */
    }
    o.onChange(true)
  }

  function exit() {
    if (!active) return
    active = false
    dragging = false
    controls.enabled = true
    camera.rotation.order = 'XYZ'
    camera.position.copy(saved.pos)
    controls.target.copy(saved.target)
    camera.fov = saved.fov
    camera.near = saved.near
    camera.updateProjectionMatrix()
    camera.lookAt(saved.target)
    document.body.classList.remove('fp')
    ui.classList.remove('on')
    if (document.pointerLockElement === canvas) document.exitPointerLock()
    locked = false
    o.onChange(false)
  }

  function shoot() {
    const img = o.shutter()
    photos++
    count.textContent = `${photos} photo${photos === 1 ? '' : 's'} taken`
    if (img) {
      thumb.src = img
      thumb.classList.add('on')
      clearTimeout(thumbTimer)
      thumbTimer = window.setTimeout(() => thumb.classList.remove('on'), 3500)
    }
  }

  document.addEventListener('pointerlockchange', () => {
    const was = locked
    locked = document.pointerLockElement === canvas
    if (was && !locked && active) exit() // Esc releases the pointer, which also leaves photo mode
  })
  canvas.addEventListener('pointerdown', (e) => {
    if (!active || e.button !== 0) return
    if (locked) shoot()
    else dragging = true // no pointer lock available: drag to look instead
  })
  addEventListener('pointerup', () => (dragging = false))
  canvas.addEventListener('pointermove', (e) => {
    if (active && (locked || dragging)) look(e.movementX, e.movementY)
  })
  canvas.addEventListener(
    'wheel',
    (e) => {
      if (!active) return
      e.preventDefault()
      fov = Math.max(25, Math.min(85, fov + e.deltaY * 0.03))
      camera.fov = fov
      camera.updateProjectionMatrix()
    },
    { passive: false },
  )
  ui.querySelector<HTMLElement>('.fp-shutter')!.addEventListener('click', (e) => {
    e.stopPropagation()
    shoot()
  })

  return {
    get active() {
      return active
    },
    get position() {
      return camera.position
    },
    enter,
    exit,
    toggle: () => (active ? exit() : enter()),
    shoot,
    /** Move and aim the camera. Called every frame while active. */
    update(dt: number) {
      if (!active) return
      const f = +(keys.has('w') || keys.has('arrowup')) - +(keys.has('s') || keys.has('arrowdown'))
      const r = +(keys.has('d') || keys.has('arrowright')) - +(keys.has('a') || keys.has('arrowleft'))
      if (f || r) {
        const len = Math.hypot(f, r)
        const step = (keys.has('shift') ? RUN : WALK) * dt
        const dx = (-Math.sin(yaw) * f + Math.cos(yaw) * r) * (step / len)
        const dz = (-Math.cos(yaw) * f - Math.sin(yaw) * r) * (step / len)
        // slide along walls: try each axis on its own
        if (fits(pos.x + dx, pos.y)) pos.x += dx
        if (fits(pos.x, pos.y + dz)) pos.y += dz
        bobT += dt * (keys.has('shift') ? 11 : 7)
      }
      camera.position.set(pos.x, EYE + (f || r ? Math.sin(bobT) * 0.012 : 0), pos.y)
      camera.rotation.set(pitch, yaw, 0)
    },
  }
}
