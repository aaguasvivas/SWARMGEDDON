/**
 * Turn every number field of `o` into a double field, keeping its value.
 *
 * V8 stores a field that has only held small integers as an integer field. The
 * first fraction written to it later (the first boss fight, the first pod, the
 * first acid pool) changes the hidden class of every object of that shape and
 * throws away the optimized code of each system compiled against it. Those
 * systems then run unoptimized for many frames, boxing every intermediate
 * number: megabytes of garbage and a CPU spike in the middle of a run. Writing
 * a fraction once at construction settles the shape before the first run.
 * Values never change, so the sim is unaffected.
 */
export function doubleFields(o: object): void {
  const r = o as Record<string, unknown>
  for (const k of Object.keys(r)) {
    const v = r[k]
    if (typeof v === 'number') {
      r[k] = 0.5
      r[k] = v
    }
  }
}
