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
export const ATK_RIFT_BLINK = 4
export const ATK_PSI_LANCE = 5
export const ATK_UNDERTOW = 6
export const ATK_RIFT_STORM = 7
export const ATK_MAGMA_MORTAR = 8
export const ATK_FLAK_TURRETS = 9
export const ATK_SCORCH_SWEEP = 10
export const ATK_CINDERFALL = 11

const DEG = Math.PI / 180

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

const MID2: BossStageDef = {
  hpBase: 3380,
  phases: [0.66, 0.33],
  cadence: [1.0, 1.2, 1.35],
  teleMul: [1.0, 1.0, 0.8],
  rotations: [loop(SLOT_A, SLOT_B, SLOT_C), loop(SLOT_A, SLOT_C, SLOT_B), loop(SLOT_B, SLOT_A, SLOT_C)],
}

/** A10.2. The OVERTIME boss fights as mid2 from its own hpBase (the A13 knob,
 *  apart from mid2's since P19); the director scales it by OVERTIME.bossHpMul^c. */
export const BOSS_STAGES: Readonly<Record<BossStage, BossStageDef>> = {
  mid1: {
    hpBase: 2760,
    phases: [0.5],
    cadence: [1.0, 1.2],
    teleMul: [1.0, 1.0],
    rotations: [loop(SLOT_A, SLOT_B), loop(SLOT_A, SLOT_B, SLOT_C)],
  },
  mid2: MID2,
  overtime: { ...MID2, hpBase: 2600 },
  final: {
    hpBase: 9800,
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
const MATRON_KIT: BossKit = { idleGap: 0.7, range: 260, speedMul: 1, strafe: true, attacks: [ATK_RIFT_BLINK, ATK_PSI_LANCE, ATK_UNDERTOW, ATK_RIFT_STORM] }
const TYRANT_KIT: BossKit = { idleGap: 1.1, range: 300, speedMul: 0.6, strafe: false, attacks: [ATK_MAGMA_MORTAR, ATK_FLAK_TURRETS, ATK_SCORCH_SWEEP, ATK_CINDERFALL] }

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

/** THE VOID MATRON's attacks (A10.3). */
export const RIFT_BLINK = { tele: 0.9, active: 0.15, recover: 0.8, damage: 26, r: 140 } as const
export const PSI_LANCE = {
  tele: 0.8, recover: 0.7, damage: 16, lanes: 3, spread: 24 * DEG, len: 700, halfW: 22, speed: 760, radius: 9,
  echoDelay: 0.15, boltLighten: 0.6,
} as const
/** `decal`: the wraith ring plus a wraith radius; it stays up through the pull. */
export const UNDERTOW = { tele: 0.7, active: 3.0, recover: 0.6, pull: 150, unit: 'wraith', count: 6, ringR: 90, decal: 104 } as const
export const RIFT_STORM = { tele: 0.7, active: 0.15, recover: 1.0, damage: 22, r: 120, count: 3 } as const

/** THE EMBER TYRANT's attacks (A10.3). */
export const MAGMA_MORTAR = { tele: 1.0, active: 0.15, recover: 0.8, damage: 22, r: 70, ring: 4, ringR: 120 } as const
/** `decal`: the marker circle at each turret spot. A ring whose draw puts a
 *  spot within `shipClear` of the ship turns so the ship's bearing from the
 *  boss falls midway between two spots (P19; count 3 at ringR 170 keeps every
 *  spot 147 u or more from the ship, before the wall and cage clamp). */
export const FLAK_TURRETS = { tele: 0.8, recover: 0.6, unit: 'flakTurret', count: 3, ringR: 170, maxAlive: 6, decal: 34, shipClear: 120 } as const
export const SCORCH_SWEEP = { tele: 0.9, active: 1.4, recover: 0.8, damage: 28, arc: 120 * DEG, reach: 460, halfW: 30 } as const
/** Circle k lands `r0 + rStep * k` from the player's spot at the cast start,
 *  at `angStep * k` plus one boss draw, `gap` seconds after circle k - 1. */
export const CINDERFALL = {
  tele: 1.0, active: 0.15, recover: 1.0, damage: 20, r: 80, count: 12, r0: 90, rStep: 27, angStep: 50 * DEG, gap: 0.25,
} as const
