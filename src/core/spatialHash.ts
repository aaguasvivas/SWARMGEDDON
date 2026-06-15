/**
 * Uniform-grid spatial hash for broad-phase collision. Turns the O(n²) "every
 * projectile vs every enemy" check into "each projectile vs the handful of
 * enemies in its neighboring cells".
 *
 * Rebuilt each tick from current enemy positions: `clear()` then `insert()` all
 * enemies, then `query()` candidate enemies around each projectile / the player.
 * Buckets are reused across frames (clear sets length=0, keeps the arrays) so a
 * steady-state frame allocates nothing.
 *
 * The caller does the precise circle test on the returned candidates — the hash
 * only narrows the field.
 */
export class SpatialHash<T> {
  private readonly cells = new Map<number, T[]>()

  constructor(private readonly cellSize: number) {}

  /** Empty every bucket but keep the arrays for reuse (no GC churn). */
  clear(): void {
    for (const bucket of this.cells.values()) bucket.length = 0
  }

  insert(item: T, x: number, y: number): void {
    const k = this.keyFor(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize))
    let bucket = this.cells.get(k)
    if (bucket === undefined) {
      bucket = []
      this.cells.set(k, bucket)
    }
    bucket.push(item)
  }

  /**
   * Collect every item whose cell overlaps the (x,y,radius) circle's bounding
   * box into `out` (cleared first). Returns the count. `out` is caller-owned and
   * reused to avoid per-query allocation.
   */
  query(x: number, y: number, radius: number, out: T[]): number {
    out.length = 0
    const cs = this.cellSize
    const minCx = Math.floor((x - radius) / cs)
    const maxCx = Math.floor((x + radius) / cs)
    const minCy = Math.floor((y - radius) / cs)
    const maxCy = Math.floor((y + radius) / cs)
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const bucket = this.cells.get(this.keyFor(cx, cy))
        if (bucket !== undefined) {
          for (let i = 0; i < bucket.length; i++) out.push(bucket[i]!)
        }
      }
    }
    return out.length
  }

  /**
   * Pack signed cell coords into one number key. Unique while |cy| < 50000 cells
   * (the arena is a few thousand px / 72px cells ≈ <100 cells, so far inside).
   */
  private keyFor(cx: number, cy: number): number {
    return cx * 100000 + cy
  }
}
