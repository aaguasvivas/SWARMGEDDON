import { BONUS, BONUS_FX } from '../config.ts'
import {
  BONUSES, BONUS_FIREBLAST, BONUS_FREEZE, BONUS_NUKE, BONUS_OVERDRIVE, BONUS_SHIELD, BONUS_VACUUM,
} from '../content/bonuses.ts'
import type { EnemyDef } from '../content/enemies.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { PICKUP_SLOT } from '../game/pickup.ts'
import { tickDown } from '../game/player.ts'
import type { World } from '../game/world.ts'
import { nukeHit } from './collision.ts'
import { dropBonus, vacuumPickups } from './pickups.ts'
import { fireRing } from './weapons.ts'

/** Type weights of the roll in progress, 0 for an excluded type (scratch). */
const wts = new Float64Array(BONUSES.length)

/**
 * A kill may drop a bonus (section 4.6, A5.3): the first elite kill of a run
 * always does; otherwise PER_XP chance per kill, or any kill worth 2+ XP once
 * pityAfter seconds pass with no drop. Never within minGap of the last drop,
 * never past maxOnField, never from a NUKE or FIREBLAST kill (`noBonus`).
 * Capacity and timing gate before any draw.
 */
export function bonusOnKill(w: World, def: EnemyDef, x: number, y: number, noBonus: boolean): void {
  const firstElite = def.elite && !w.eliteKilled
  if (def.elite) w.eliteKilled = true
  if (noBonus || w.pickupN[PICKUP_SLOT.bonus]! >= BONUS.maxOnField) return
  const t = w.time
  if (!firstElite) {
    if (t - w.lastBonusAt < BONUS.minGap) return
    const pity = def.xp >= 2 && t - w.lastBonusAt >= BONUS.pityAfter
    if (!pity && !(w.rngs.loot.float() < BONUS.perXpChance * def.xp)) return
  }
  const type = rollType(w)
  if (type < 0 || !dropBonus(w, x, y, type)) return
  w.lastBonusAt = t
  w.lastBonusType = type
}

/** Weighted type roll (one loot draw). Excluded: types on the field, timed
 *  types still running, the last type dropped, and VACUUM under vacuumMinGems
 *  gems. -1 when every type is excluded (no draw). */
function rollType(w: World): number {
  let total = 0
  for (let k = 0; k < BONUSES.length; k++) {
    const out =
      k === w.lastBonusType || onField(w, k) || running(w, k) ||
      (k === BONUS_VACUUM && w.pickupN[PICKUP_SLOT.xp]! < BONUS_FX.vacuumMinGems)
    wts[k] = out ? 0 : BONUSES[k]!.weight
    total += wts[k]!
  }
  if (total <= 0) return -1
  let r = w.rngs.loot.float() * total
  let last = -1
  for (let k = 0; k < BONUSES.length; k++) {
    if (wts[k]! <= 0) continue
    last = k
    r -= wts[k]!
    if (r < 0) return k
  }
  return last
}

function onField(w: World, type: number): boolean {
  const a = w.pickups.active
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    if (p.alive && p.kind === 'bonus' && p.sub === type) return true
  }
  return false
}

function running(w: World, type: number): boolean {
  if (type === BONUS_FREEZE) return w.freezeT > 0
  if (type === BONUS_OVERDRIVE) return w.overdriveT > 0
  if (type === BONUS_SHIELD) return w.shieldT > 0
  return false
}

/** Bonus contact: apply its effect. */
export function takeBonus(w: World, type: number): void {
  const pl = w.player
  const def = BONUSES[type]!
  switch (type) {
    case BONUS_NUKE:
      nuke(w)
      break
    case BONUS_FREEZE:
      w.freezeT = def.duration
      break
    case BONUS_OVERDRIVE:
      w.overdriveT = def.duration
      break
    case BONUS_SHIELD:
      w.shieldT = def.duration
      break
    case BONUS_FIREBLAST:
      fireRing(w, BONUS_FX.fireblastShots, BONUS_FX.fireblastDmgMul, BONUS_FX.fireblastPierce, pl.facing, true)
      break
    case BONUS_VACUUM:
      vacuumPickups(w)
      break
  }
  w.feel.emit(FeelKind.BonusPickup, 0, pl.x, pl.y, def.duration, type)
}

/** NUKE: every non-elite, non-boss enemy within nukeR dies (kills and XP, no
 *  score); elites lose nukeEliteFrac of max HP, bosses nukeBossFrac; enemy
 *  shots within nukeR are removed. Only the enemies alive at the blast are
 *  hit: the brood a nuked BROOD elite bursts into lives. */
function nuke(w: World): void {
  const pl = w.player
  const r2 = BONUS_FX.nukeR * BONUS_FX.nukeR
  const a = w.enemies.active
  const n = a.length
  for (let i = 0; i < n; i++) {
    const e = a[i]!
    if (!e.alive || e.submerged) continue
    const dx = e.x - pl.x
    const dy = e.y - pl.y
    if (dx * dx + dy * dy >= r2) continue
    const def = e.def
    nukeHit(w, e, def.boss ? e.maxHp * BONUS_FX.nukeBossFrac : def.elite ? e.maxHp * BONUS_FX.nukeEliteFrac : e.hp)
  }
  const eps = w.enemyProjectiles.active
  for (let i = 0; i < eps.length; i++) {
    const p = eps[i]!
    const dx = p.x - pl.x
    const dy = p.y - pl.y
    if (p.alive && dx * dx + dy * dy < r2) p.alive = false
  }
}

/** Timed bonuses run down (stepSim slot: after pickupSystem). */
export function bonusSystem(w: World, dt: number): void {
  if (w.freezeT > 0) {
    w.freezeT = tickDown(w.freezeT, dt)
    if (w.freezeT === 0) ended(w, BONUS_FREEZE)
  }
  if (w.overdriveT > 0) {
    w.overdriveT = tickDown(w.overdriveT, dt)
    if (w.overdriveT === 0) ended(w, BONUS_OVERDRIVE)
  }
  if (w.shieldT > 0) {
    w.shieldT = tickDown(w.shieldT, dt)
    if (w.shieldT === 0) ended(w, BONUS_SHIELD)
  }
}

function ended(w: World, type: number): void {
  const pl = w.player
  w.feel.emit(FeelKind.BonusEnd, 0, pl.x, pl.y, 0, type)
}
