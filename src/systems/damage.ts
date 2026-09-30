import { FF_ACID, FF_CONTACT, FF_DISCRETE, FeelKind } from '../effects/feelQueue.ts'
import { FUSION, GRACE } from '../config.ts'
import { spawnRing } from '../effects/fx.ts'
import { addContinuousDamage, registerHit } from '../game/scoring.ts'
import type { World } from '../game/world.ts'

export type HurtKind = 'bite' | 'discrete' | 'zone'

const SHIELD_RING_TINT = 0x9be7ff
const SHIELD_RING_SCALE = 2

/**
 * The only way the player loses HP. LIVING ARMOR's overshield absorbs first;
 * a hit it takes whole emits ShieldHit instead of PlayerHurt. Returns the
 * damage that landed (overshield included); callers consume an enemy
 * projectile only when the result is > 0. Only HP removed counts as a scoring
 * hit. `sx, sy` is the source point for presentation, `ff` adds feel flags
 * (FF_RAM).
 */
export function hurtPlayer(w: World, amount: number, kind: HurtKind, srcIdx: number, sx: number, sy: number, ff = 0): number {
  const pl = w.player
  if (pl.invuln > 0) return 0
  if (kind === 'discrete' && pl.hitCd > 0) return 0
  const dmg = amount * (1 - w.mods.damageReduction)
  if (dmg <= 0) return 0
  let rest = dmg
  if (w.overshield > 0) {
    const s = w.overshield < rest ? w.overshield : rest
    w.overshield -= s
    rest -= s
  }
  if (kind === 'discrete') pl.hitCd = GRACE.hit
  const kf = (kind === 'discrete' ? FF_DISCRETE : kind === 'bite' ? FF_CONTACT : FF_ACID) | ff
  if (rest <= 0) {
    w.feel.emit(FeelKind.ShieldHit, kf, sx, sy, dmg)
    if (kind !== 'zone') spawnRing(w, pl.x, pl.y, SHIELD_RING_TINT, SHIELD_RING_SCALE)
    return dmg
  }
  pl.hp -= rest
  w.damageTaken += rest
  w.lastHitBy = srcIdx
  w.feel.emit(FeelKind.PlayerHurt, kf, sx, sy, rest)
  if (kind === 'discrete') registerHit(w)
  else addContinuousDamage(w, rest)
  return dmg
}

/** Every heal goes through here. With LIVING ARMOR, healing past max HP
 *  becomes overshield, up to FUSION.livingArmorFrac of max HP. Returns the HP
 *  restored (overshield not included). */
export function healPlayer(w: World, amount: number): number {
  const pl = w.player
  if (amount <= 0 || pl.hp <= 0) return 0
  const room = pl.maxHp - pl.hp
  const add = amount < room ? amount : room
  pl.hp += add
  if (w.mods.livingArmor > 0 && amount > add) {
    const cap = FUSION.livingArmorFrac * pl.maxHp
    const v = w.overshield + amount - add
    w.overshield = v < cap ? v : cap
  }
  return add
}

function bloodrushActive(w: World): boolean {
  const pl = w.player
  return w.mods.bloodrush > 0 && pl.hp < pl.maxHp * FUSION.bloodrushBelow
}

/** Kill healing per second, which is also the bucket's size. */
function killHealCap(w: World): number {
  const cap = w.mods.killHealCap
  return bloodrushActive(w) ? cap * FUSION.bloodrushCapMul : cap
}

/** Refill the kill-heal bucket. collisionSystem runs it before any kill. */
export function refillKillHeal(w: World, dt: number): void {
  const cap = killHealCap(w)
  const v = w.killHealBudget + cap * dt
  w.killHealBudget = v < cap ? v : cap
}

/** Kill healing (Vampiric), limited to killHealCap HP/s by the bucket. */
export function killHeal(w: World, amount: number): void {
  const a = bloodrushActive(w) ? amount * FUSION.bloodrushHealMul : amount
  const take = a < w.killHealBudget ? a : w.killHealBudget
  if (take <= 0) return
  w.killHealBudget -= take
  healPlayer(w, take)
}

/** The player's move speed multiplier this tick. */
export function playerSpeedMul(w: World): number {
  const m = w.mods.moveSpeedMul
  return bloodrushActive(w) ? m * FUSION.bloodrushSpeedMul : m
}
