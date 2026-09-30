import { CHAIN_DECAY_S, CONTACT_ACC_RESET_S, CONTACT_HIT_HP, KILL_PTS_PER_XP, scoreOf, tierOf } from '../core/rules.ts'
import type { EnemyDef } from '../content/enemies.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import type { World } from './world.ts'

/**
 * Score and multiplier (docs/NEXT-LEVEL.md 5). Integer points, no RNG, no
 * allocation. The sim writes these counters and never reads score, tier or
 * chain back, so scoring can never change a run.
 */

export const enum KillSource { Weapon = 0, NoScore = 1 }

/** Fixed-step sums of 1/60 land a hair under whole seconds. */
const EPS = 1e-6

export function scoreKill(w: World, def: EnemyDef, src: KillSource): void {
  w.kills++
  w.xpSum += def.xp
  w.killsByDef[def.idx]!++
  if (def.boss) {
    w.bossesSlain++
    if (w.hits === w.hitsAtBossSpawn) w.bossesFlawless++
  } else if (def.elite) {
    w.elitesSlain++
  }
  if (src === KillSource.Weapon) {
    w.chain++
    w.chainT = 0
    if (w.chain > w.bestChain) w.bestChain = w.chain
    setTier(w)
    w.killPts += KILL_PTS_PER_XP * def.xp * w.tier
  }
  refreshScore(w)
}

/** A hit that removed HP: the chain halves. */
export function registerHit(w: World): void {
  w.hits++
  w.noHitTime = 0
  w.chain >>= 1
  setTier(w)
  w.feel.emit(FeelKind.ChainHit, 0, w.player.x, w.player.y, w.chain)
}

/** Bites and acid: every CONTACT_HIT_HP removed counts as one hit. */
export function addContinuousDamage(w: World, hp: number): void {
  w.contAcc += hp
  w.contIdle = 0
  while (w.contAcc >= CONTACT_HIT_HP) {
    w.contAcc -= CONTACT_HIT_HP
    registerHit(w)
  }
}

export function addChain(w: World, n: number): void {
  w.chain += n
  if (w.chain > w.bestChain) w.bestChain = w.chain
  setTier(w)
}

/** The run is cleared now: the clear bonus joins the score. */
export function scoreClear(w: World): void {
  w.clearMs = Math.round(w.time * 1000)
  refreshScore(w)
}

/** stepSim slot: after acidSystem. Chain decay, the contact accumulator reset
 *  and the no-hit clock. */
export function scoreStep(w: World, dt: number): void {
  w.noHitTime += dt
  if (w.noHitTime > w.longestNoHit) w.longestNoHit = w.noHitTime
  w.contIdle += dt
  if (w.contIdle + EPS >= CONTACT_ACC_RESET_S) w.contAcc = 0
  w.chainT += dt
  if (w.chainT + EPS >= CHAIN_DECAY_S) {
    w.chainT -= CHAIN_DECAY_S
    if (w.chain > 0) {
      w.chain >>= 1
      setTier(w)
    }
  }
}

export function refreshScore(w: World): void {
  w.score = scoreOf(w.killPts, w.xpSum, w.clearMs, w.threat)
}

function setTier(w: World): void {
  const t = tierOf(w.chain)
  if (t === w.tier) return
  w.feel.emit(t > w.tier ? FeelKind.MultUp : FeelKind.MultDown, 0, w.player.x, w.player.y, t)
  w.tier = t
  if (t > w.peakTier) w.peakTier = t
}
