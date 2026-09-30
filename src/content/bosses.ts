import type { BossStage } from './runScripts.ts'

/**
 * Boss fights (docs/NEXT-LEVEL.md A10): stage table, rotations and attack kits.
 * Pure data. bossAI.ts runs it.
 */

/** Rotation slots: a kit maps each to one of its attacks. */
export const SLOT_A = 0
export const SLOT_B = 1
export const SLOT_C = 2
export const SLOT_SIG = 3

/** Attack kinds (the FeelKind.BossTele event carries one in `a`). */
export const ATK_SPORE_NOVA = 0
export const ATK_ROYAL_LUNGE = 1
export const ATK_EGG_CLUTCH = 2
export const ATK_MOTHERS_CALL = 3

export interface PhaseRotation {
  /** Slots cast in order; after the last one the rotation restarts at `loopFrom`. */
  slots: readonly number[]
  /** 0 = plain loop. 1 = slots[0] is an opener, cast at once after the phase's ROAR. */
  loopFrom: number
}

export interface BossStageDef {
  hpBase: number
  /** HP fractions that start phase 2 and phase 3. */
  phases: readonly number[]
  /** Divides the idle gap and every recover, per phase. */
  cadence: readonly number[]
  teleMul: readonly number[]
  rotations: readonly PhaseRotation[]
}

const loop = (...slots: number[]): PhaseRotation => ({ slots, loopFrom: 0 })

/** A10.2. Overtime bosses use `mid2` with hpBase x 1.35^c (P11). */
export const BOSS_STAGES: Readonly<Record<BossStage, BossStageDef>> = {
  mid1: {
    hpBase: 2400,
    phases: [0.5],
    cadence: [1.0, 1.2],
    teleMul: [1.0, 1.0],
    rotations: [loop(SLOT_A, SLOT_B), loop(SLOT_A, SLOT_B, SLOT_C)],
  },
  mid2: {
    hpBase: 2600,
    phases: [0.66, 0.33],
    cadence: [1.0, 1.2, 1.35],
    teleMul: [1.0, 1.0, 0.8],
    rotations: [loop(SLOT_A, SLOT_B, SLOT_C), loop(SLOT_A, SLOT_C, SLOT_B), loop(SLOT_B, SLOT_A, SLOT_C)],
  },
  final: {
    hpBase: 4200,
    phases: [0.66, 0.33],
    cadence: [1.0, 1.2, 1.35],
    teleMul: [1.0, 1.0, 0.75],
    rotations: [
      loop(SLOT_A, SLOT_B, SLOT_C),
      loop(SLOT_A, SLOT_B, SLOT_A, SLOT_C),
      { slots: [SLOT_SIG, SLOT_A, SLOT_B, SLOT_SIG, SLOT_C], loopFrom: 1 },
    ],
  },
}

export interface BossKit {
  /** Seconds between attacks at cadence 1. */
  idleGap: number
  /** Idle movement: close to `range` at `speedMul` of the boss speed, circling
   *  the player there when `strafe` is set. */
  range: number
  speedMul: number
  strafe: boolean
  /** Attack kind per rotation slot (A, B, C, SIG). */
  attacks: readonly [number, number, number, number]
}

const QUEEN_KIT: BossKit = { idleGap: 0.9, range: 160, speedMul: 1, strafe: false, attacks: [ATK_SPORE_NOVA, ATK_ROYAL_LUNGE, ATK_EGG_CLUTCH, ATK_MOTHERS_CALL] }
// The VOID MATRON and EMBER TYRANT borrow the QUEEN's attacks until their own
// kits land (P6b); their idle movement and gaps are already theirs.
const MATRON_KIT: BossKit = { idleGap: 0.7, range: 260, speedMul: 1, strafe: true, attacks: [ATK_SPORE_NOVA, ATK_ROYAL_LUNGE, ATK_SPORE_NOVA, ATK_SPORE_NOVA] }
const TYRANT_KIT: BossKit = { idleGap: 1.1, range: 300, speedMul: 0.6, strafe: false, attacks: [ATK_SPORE_NOVA, ATK_ROYAL_LUNGE, ATK_ROYAL_LUNGE, ATK_SPORE_NOVA] }

/** A10.3, by boss def id. */
export const BOSS_KITS: Readonly<Record<string, BossKit>> = {
  queen: QUEEN_KIT,
  queenPrime: QUEEN_KIT,
  voidMatron: MATRON_KIT,
  voidMatronPrime: MATRON_KIT,
  emberTyrant: TYRANT_KIT,
  emberTyrantPrime: TYRANT_KIT,
}

/** THE QUEEN's attacks (A10.3). `decal` is the telegraph circle radius where the
 *  table gives no shape of its own. */
export const SPORE_NOVA = {
  tele: 0.9, recover: 0.7, damage: 12, count: 16, primeP3Count: 20, speed: 220, radius: 8, life: 3.0,
  ring2Delay: 0.35, ring2Rot: Math.PI / 16, decal: 120,
} as const
export const ROYAL_LUNGE = { tele: 0.9, active: 1.0, recover: 1.0, damage: 30, len: 560, halfW: 50, speed: 560 } as const
export const EGG_CLUTCH = { tele: 0.6, recover: 0.6, count: 5, primeP3Count: 7, ringR: 150 } as const
export const MOTHERS_CALL = { tele: 1.2, recover: 1.0, unit: 'swarmer', count: 24, slots: 27, hpMul: 1.5, inset: 40 } as const
