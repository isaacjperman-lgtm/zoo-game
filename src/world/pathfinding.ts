import { N, DIRS, idx } from '../config'

/** Result of a breadth-first search: shortest-path tree plus step counts from the start tile. */
export interface Bfs {
  parent: Int32Array // -2 = unreachable, -1 = start
  dist: Int16Array // -1 = unreachable
}

export function bfs(walkable: (x: number, y: number) => boolean, sx: number, sy: number): Bfs {
  const parent = new Int32Array(N * N).fill(-2)
  const dist = new Int16Array(N * N).fill(-1)
  parent[idx(sx, sy)] = -1
  dist[idx(sx, sy)] = 0
  const q = [idx(sx, sy)]
  for (let h = 0; h < q.length; h++) {
    const c = q[h]
    const cx = c % N
    const cy = (c / N) | 0
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx
      const ny = cy + dy
      if (walkable(nx, ny) && parent[idx(nx, ny)] === -2) {
        parent[idx(nx, ny)] = c
        dist[idx(nx, ny)] = dist[c] + 1
        q.push(idx(nx, ny))
      }
    }
  }
  return { parent, dist }
}

export const reachable = (b: Bfs, x: number, y: number) => b.parent[idx(x, y)] !== -2

/** Tiles to walk through to reach (gx, gy), not including the start tile. */
export function pathTo(b: Bfs, gx: number, gy: number) {
  const out: { x: number; y: number }[] = []
  for (let c = idx(gx, gy); c >= 0 && b.parent[c] !== -2; c = b.parent[c]) {
    out.push({ x: c % N, y: (c / N) | 0 })
  }
  return out.reverse().slice(1)
}
