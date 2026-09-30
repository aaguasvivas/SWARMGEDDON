import type { Poolable } from '../core/pool.ts'

export const HZ_CIRCLE = 0
export const HZ_LANE = 1
export const HZ_SWEEP = 2

export const HZ_END_NONE = 0
export const HZ_END_MAGMA = 1
export const HZ_END_BLINK = 2
export const HZ_END_SPAWN = 3

/**
 * A telegraphed ground attack (docs/NEXT-LEVEL.md 4.7). It warns for `teleMax`
 * seconds, detonates, then stays live for `liveMax` seconds and hits the
 * player at most once per cast. `damage` 0 makes it a marker that only shows
 * where something is about to happen. Sim data only: hazardRenderer draws it.
 */
export class Hazard implements Poolable {
  alive = false
  /** Spawn order within the run, so a holder can tell its hazard from a recycled one. */
  seq = 0
  shape = HZ_CIRCLE
  x = 0
  y = 0
  /** Circle radius, or the half width of a lane or of a sweep's flame line. */
  r = 0
  /** Lane length, or the sweep's reach. */
  len = 0
  /** Lane heading, or the sweep's start angle (radians). */
  ang = 0
  /** Sweep: the signed angle the flame line turns through over the live window. */
  arc = 0
  tele = 0
  teleMax = 0
  live = 0
  liveMax = 0
  damage = 0
  hit = false
  /** Cast by a boss: overlapping it while live during dash i-frames pays a Close Call. */
  boss = false
  onEnd = HZ_END_NONE
  /** HZ_END_SPAWN: the enemy def spawned where the hazard ends. */
  unit = ''
}
