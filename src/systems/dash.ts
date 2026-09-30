import { ADRENAL_WAKE, BLAST_KNOCK, DASH, FUSION } from '../config.ts'
import { CLOSE_CALL_CHAIN } from '../core/rules.ts'
import { hypot, type Vec2 } from '../core/vec.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import { tickDown } from '../game/player.ts'
import { addChain } from '../game/scoring.ts'
import type { World } from '../game/world.ts'
import { queueBlast } from './blasts.ts'
import { fireRing } from './weapons.ts'

/** The slice of the per-tick input sample the dash reads. */
export interface DashInput {
  readonly move: Vec2
  consumeDashPress(): boolean
}

/**
 * Dash charges, buffer and start (section 4.3). Runs after aiSystem. The
 * player's damage timers also tick here, before any system that can grant or
 * test them this tick, so a grant lasts exactly its length in ticks (0.20 s of
 * dash i-frames covers ticks 0 to 11). Player.update does the motion. The
 * start hooks are Adrenal Wake and SALVO STEP; a dash that ended on the last
 * update sets off Shock Step.
 */
export function dashSystem(w: World, input: DashInput, dt: number): void {
  const pl = w.player
  const m = w.mods
  if (pl.dashEnded) {
    pl.dashEnded = false
    if (m.shockRadius > 0) queueBlast(w, pl.x, pl.y, m.shockRadius, m.shockDamage * m.damageMul, 0, BLAST_KNOCK)
  }
  pl.invuln = tickDown(pl.invuln, dt)
  if (pl.invuln === 0) pl.invulnSrc = 0
  pl.hitCd = tickDown(pl.hitCd, dt)
  pl.biteCd = tickDown(pl.biteCd, dt)
  w.dashBufferT = tickDown(w.dashBufferT, dt)

  const max = w.maxDashCharges
  const cooldown = DASH.cooldown * m.dashCooldownMul
  if (w.dashCharges < max) {
    w.dashRecharge = tickDown(w.dashRecharge, dt)
    if (w.dashRecharge === 0) {
      w.dashCharges++
      if (w.dashCharges < max) w.dashRecharge = cooldown
    }
  }

  if (input.consumeDashPress()) w.dashBufferT = DASH.buffer
  if (w.dashBufferT <= 0 || w.dashCharges <= 0 || pl.dashTicks !== 0) return

  const mx = input.move.x
  const my = input.move.y
  const ml = hypot(mx, my)
  if (ml >= DASH.minMoveForDir) {
    pl.dashDirX = mx / ml
    pl.dashDirY = my / ml
  } else {
    pl.dashDirX = Math.cos(pl.facing)
    pl.dashDirY = Math.sin(pl.facing)
  }
  if (w.dashCharges >= max) w.dashRecharge = cooldown
  w.dashCharges--
  w.dashBufferT = 0
  pl.dashTicks = DASH.ticks
  pl.endLagT = 0
  pl.grantInvuln(m.dashIframes, 1)
  w.dashSeq++
  w.dashes++
  if (m.adrenalWake > 0) w.adrenalT = ADRENAL_WAKE.sec
  if (m.salvo > 0) fireRing(w, FUSION.salvoShots, FUSION.salvoDmgFrac, 0, Math.atan2(pl.dashDirY, pl.dashDirX))
  w.feel.emit(FeelKind.Dash, 0, pl.x, pl.y, pl.dashDirX, pl.dashDirY)
}

/** Whether a dangerous overlap now would pay this dash's Close Call. */
export function closeCallArmed(w: World): boolean {
  const pl = w.player
  return pl.invuln > 0 && pl.invulnSrc === 1 && w.closeCallSeq !== w.dashSeq
}

/** Pay the Close Call reward. Callers check closeCallArmed first. */
export function closeCall(w: World): void {
  w.closeCallSeq = w.dashSeq
  w.dashRecharge = Math.max(0, w.dashRecharge - DASH.closeCallRefund)
  w.closeCalls++
  addChain(w, CLOSE_CALL_CHAIN)
  // Adrenal Wake: a Close Call stretches this dash's window to closeCallSec.
  if (w.adrenalT > 0) w.adrenalT += ADRENAL_WAKE.closeCallSec - ADRENAL_WAKE.sec
  const pl = w.player
  w.feel.emit(FeelKind.CloseCall, 0, pl.x, pl.y)
}
