import { FF_ACID, FF_CONTACT, FF_DISCRETE, FeelKind } from '../effects/feelQueue.ts'
import { GRACE } from '../config.ts'
import { addContinuousDamage, registerHit } from '../game/scoring.ts'
import type { World } from '../game/world.ts'

export type HurtKind = 'bite' | 'discrete' | 'zone'

/**
 * The only way the player loses HP. Returns the HP removed; callers consume an
 * enemy projectile only when the result is > 0. `sx, sy` is the source point
 * for presentation, `ff` adds feel flags (FF_RAM).
 */
export function hurtPlayer(w: World, amount: number, kind: HurtKind, srcIdx: number, sx: number, sy: number, ff = 0): number {
  const pl = w.player
  if (pl.invuln > 0) return 0
  if (kind === 'discrete' && pl.hitCd > 0) return 0
  const rest = amount * (1 - w.mods.damageReduction)
  if (rest <= 0) return 0
  pl.hp -= rest
  w.damageTaken += rest
  w.lastHitBy = srcIdx
  if (kind === 'discrete') {
    pl.hitCd = GRACE.hit
    w.feel.emit(FeelKind.PlayerHurt, FF_DISCRETE | ff, sx, sy, rest)
    registerHit(w)
  } else {
    w.feel.emit(FeelKind.PlayerHurt, (kind === 'bite' ? FF_CONTACT : FF_ACID) | ff, sx, sy, rest)
    addContinuousDamage(w, rest)
  }
  return rest
}
