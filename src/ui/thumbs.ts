import * as THREE from 'three'
import { SPECIES } from '../data/species'
import { animalModel, personModel } from '../entities/models'

/** Renders each species (and the keeper) once to a PNG data URL for use as shop icons. */
export function makeThumbnails(): Record<string, string> {
  const out: Record<string, string> = {}
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  r.setSize(192, 192, false)
  r.setPixelRatio(1)
  r.toneMapping = THREE.ACESFilmicToneMapping
  r.setClearColor(0x000000, 0)
  const sc = new THREE.Scene()
  sc.add(new THREE.HemisphereLight(0xffffff, 0x6a7a5a, 1.7))
  const dl = new THREE.DirectionalLight(0xfff2dd, 2.6)
  dl.position.set(3, 5, 4)
  sc.add(dl)
  const cam = new THREE.PerspectiveCamera(28, 1, 0.1, 50)
  const jobs: [string, THREE.Group][] = [
    ...SPECIES.map((s) => [s.id, animalModel(s)] as [string, THREE.Group]),
    ['keeper', personModel(0x2a5db0, true)],
  ]
  for (const [id, g] of jobs) {
    sc.add(g)
    const box = new THREE.Box3().setFromObject(g),
      c = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3())
    const dist = ((Math.max(size.x, size.y, size.z) * 0.5) / Math.tan(THREE.MathUtils.degToRad(14))) * 1.2
    cam.position.set(c.x + dist * 0.75, c.y + dist * 0.35, c.z + dist * 0.65)
    cam.lookAt(c)
    r.render(sc, cam)
    out[id] = r.domElement.toDataURL('image/png')
    sc.remove(g)
  }
  r.dispose()
  return out
}
