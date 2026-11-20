import * as THREE from 'three'
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/** Every merged mesh shares this one material; each piece keeps its color as a per-vertex color. */
export const bakedMat = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.88,
  flatShading: true,
})

/**
 * Merge a model's many small meshes into a few. Everything that never moves on its own becomes one mesh on the
 * root, and the contents of each `pivots` group (legs, arms: anything the animation rotates) become one mesh on
 * that pivot. A person drops from about 12 draw calls to 5 and a zebra from about 25 to 5, and shadows pay the same
 * saving again. Only meshes whose material passes `mergeable` (plain flat colors) are touched, so glowing, see-through
 * or otherwise special parts keep their own materials.
 */
export function bakeModel(
  root: THREE.Group,
  mergeable: (m: THREE.Material) => boolean,
  pivots: THREE.Object3D[] = [],
) {
  root.updateMatrixWorld(true)
  const buckets = new Map<THREE.Object3D, THREE.Mesh[]>()
  const ownerOf = (m: THREE.Object3D) => {
    for (let p = m.parent; p; p = p.parent) {
      if (pivots.includes(p)) return p
      if (p === root) break
    }
    return root
  }
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (!m.isMesh || Array.isArray(m.material) || !mergeable(m.material)) return
    const owner = ownerOf(m)
    const list = buckets.get(owner)
    if (list) list.push(m)
    else buckets.set(owner, [m])
  })
  const inv = new THREE.Matrix4()
  for (const [owner, meshes] of buckets) {
    inv.copy(owner.matrixWorld).invert()
    const geos = meshes.map((m) => {
      let g = m.geometry.clone()
      g.deleteAttribute('uv')
      // Keep geometry indexed so shared vertices are shaded once. A few shapes (icosahedrons) come unindexed.
      if (!g.index) g = mergeVertices(g, 1e-4)
      g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld))
      const c = (m.material as THREE.MeshStandardMaterial).color
      const n = g.getAttribute('position').count
      const colors = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3)
      g.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      return g
    })
    const merged = new THREE.Mesh(mergeGeometries(geos, false)!, bakedMat)
    merged.castShadow = meshes.some((m) => m.castShadow)
    merged.receiveShadow = meshes.some((m) => m.receiveShadow)
    for (const m of meshes) {
      m.removeFromParent()
      m.geometry.dispose()
    }
    for (const g of geos) g.dispose()
    owner.add(merged)
  }
  // tidy up groups the merge left empty (the pivots themselves stay: the animation needs them)
  const prune = (o: THREE.Object3D) => {
    for (const c of [...o.children]) prune(c)
    if (o !== root && !pivots.includes(o) && o.type === 'Group' && o.children.length === 0)
      o.removeFromParent()
  }
  prune(root)
  return root
}
