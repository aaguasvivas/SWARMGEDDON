/**
 * Generic object pool. The hot loop must never call `new` after warmup, so
 * every short-lived entity (enemy, projectile, particle, floating text) is
 * recycled through one of these.
 *
 * Usage pattern per frame:
 *   1. systems acquire() new entities and mutate `active` ones,
 *   2. systems set `alive = false` on anything that should die,
 *   3. one `sweep()` compacts the dead out of `active` and back onto the free
 *      list (O(active), swap-remove, no allocation).
 *
 * `active` is a dense array safe to iterate directly. Don't hold references to
 * pooled objects across a sweep — a recycled object may be reused.
 */
export interface Poolable {
  alive: boolean
}

export class Pool<T extends Poolable> {
  /** Dense list of live objects. Iterate this directly in systems. */
  readonly active: T[] = []
  private readonly free: T[] = []

  constructor(
    private readonly factory: () => T,
    private readonly reset: (o: T) => void,
    prewarm = 0,
  ) {
    for (let i = 0; i < prewarm; i++) this.free.push(this.factory())
  }

  get size(): number {
    return this.active.length
  }

  /** Take an object from the free list (or make one), mark it live, track it. */
  acquire(): T {
    const o = this.free.pop() ?? this.factory()
    o.alive = true
    this.active.push(o)
    return o
  }

  /**
   * Remove every dead object from `active`, reset it, and recycle it.
   * Backward swap-remove keeps it O(n) with no holes and no allocation.
   */
  sweep(): void {
    const a = this.active
    for (let i = a.length - 1; i >= 0; i--) {
      const o = a[i]!
      if (!o.alive) {
        this.reset(o)
        const last = a.length - 1
        a[i] = a[last]!
        a.pop()
        this.free.push(o)
      }
    }
  }

  /** Kill and recycle everything at once (run restart). Leak-free. */
  clear(): void {
    const a = this.active
    for (let i = 0; i < a.length; i++) {
      const o = a[i]!
      o.alive = false
      this.reset(o)
      this.free.push(o)
    }
    a.length = 0
  }
}
