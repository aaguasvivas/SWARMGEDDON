import { MAX_ENEMIES, MAX_HAZARDS } from '../config.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { spawnRing } from '../effects/fx.ts'
import { HZ_CIRCLE, HZ_END_BLINK, HZ_END_MAGMA, HZ_END_NONE, HZ_END_SPAWN, HZ_LANE, type Hazard } from '../game/hazard.ts'
import { tickDown } from '../game/player.ts'
import type { World } from '../game/world.ts'
import { spawnAcidPool } from './acid.ts'
import { hurtPlayer } from './damage.ts'
import { closeCall, closeCallArmed } from './dash.ts'
import { spawnEnemy } from './spawn.ts'

/** Source id hurtPlayer records for hazard damage (section 4.2). */
const SRC_HAZARD = -3

/**
 * Take a hazard from the pool (null when all MAX_HAZARDS are live). It warns
 * for `tele` seconds, then is live for `live` seconds (0 = one test on the
 * detonation tick). Callers set the shape fields they need after this.
 */
export function spawnHazard(w: World, shape: number, x: number, y: number, r: number, tele: number, live: number, damage: number): Hazard | null {
  if (w.hazards.size >= MAX_HAZARDS) return null
  const h = w.hazards.acquire()
  h.seq = ++w.hazardSeq
  h.shape = shape
  h.x = x
  h.y = y
  h.r = r
  h.len = 0
  h.ang = 0
  h.arc = 0
  h.tele = h.teleMax = tele
  h.live = h.liveMax = live
  h.damage = damage
  h.hit = false
  h.boss = false
  h.onEnd = HZ_END_NONE
  h.unit = ''
  return h
}

/**
 * stepSim slot after collisionSystem: count telegraphs down, detonate, test
 * the live window against the player (one hit per cast), then run `onEnd`.
 */
export function hazardsTick(w: World, dt: number): void {
  const a = w.hazards.active
  for (let i = 0; i < a.length; i++) {
    const h = a[i]!
    if (!h.alive) continue
    if (h.tele > 0) {
      h.tele = tickDown(h.tele, dt)
      if (h.tele > 0) continue
      if (h.damage > 0) {
        spawnRing(w, h.x, h.y, 0xffffff, h.shape === HZ_CIRCLE ? h.r / 22 : 3)
        w.feel.emit(FeelKind.HazardDetonate, 0, h.x, h.y, h.r)
      }
    }
    if (h.damage > 0 && !h.hit && overlapsPlayer(w, h)) {
      if (h.boss && closeCallArmed(w)) closeCall(w)
      if (hurtPlayer(w, h.damage, 'discrete', SRC_HAZARD, h.x, h.y) > 0) h.hit = true
    }
    if (h.live > 0) {
      h.live = tickDown(h.live, dt)
      if (h.live > 0) continue
    }
    endHazard(w, h)
  }
}

function endHazard(w: World, h: Hazard): void {
  h.alive = false
  switch (h.onEnd) {
    case HZ_END_MAGMA:
      spawnAcidPool(w, h.x, h.y)
      break
    case HZ_END_BLINK: {
      const b = w.boss
      if (b) {
        b.x = b.prevX = h.x
        b.y = b.prevY = h.y
      }
      break
    }
    case HZ_END_SPAWN:
      if (w.enemies.size < MAX_ENEMIES - 20) spawnEnemy(w, h.unit, h.x, h.y)
      break
  }
}

/** The flame line's current angle: it turns through `arc` over the live window. */
export function sweepAngle(h: Hazard): number {
  return h.liveMax > 0 ? h.ang + h.arc * (1 - h.live / h.liveMax) : h.ang
}

function overlapsPlayer(w: World, h: Hazard): boolean {
  const pl = w.player
  const reach = h.r + pl.radius
  if (h.shape === HZ_CIRCLE) {
    const dx = pl.x - h.x
    const dy = pl.y - h.y
    return dx * dx + dy * dy < reach * reach
  }
  const ang = h.shape === HZ_LANE ? h.ang : sweepAngle(h)
  return segDistSq(pl.x, pl.y, h.x, h.y, Math.cos(ang) * h.len, Math.sin(ang) * h.len) < reach * reach
}

/** Squared distance from (px, py) to the segment from (x, y) along (vx, vy). */
function segDistSq(px: number, py: number, x: number, y: number, vx: number, vy: number): number {
  const wx = px - x
  const wy = py - y
  const vv = vx * vx + vy * vy
  let t = vv > 0 ? (wx * vx + wy * vy) / vv : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const dx = wx - vx * t
  const dy = wy - vy * t
  return dx * dx + dy * dy
}

/** Remove every hazard whose anchor lies within `r` of (x, y) (boss arrival). */
export function clearHazardsNear(w: World, x: number, y: number, r: number): void {
  const a = w.hazards.active
  for (let i = 0; i < a.length; i++) {
    const h = a[i]!
    const dx = h.x - x
    const dy = h.y - y
    if (dx * dx + dy * dy < r * r) h.alive = false
  }
}

/** Remove every hazard at once (the win). */
export function clearHazards(w: World): void {
  const a = w.hazards.active
  for (let i = 0; i < a.length; i++) a[i]!.alive = false
}
