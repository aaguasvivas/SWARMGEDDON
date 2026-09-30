import { CORES, DRAFT } from '../config.ts'
import { PERKS, findPerk } from '../content/perks.ts'
import type { BossStage } from '../content/runScripts.ts'
import { weaponIndex } from '../content/weapons.ts'
import { FeelKind } from '../effects/feelQueue.ts'
import type { World } from '../game/world.ts'

/**
 * Core shards and Hive Cores (section 4.6, A5.2). A shard is one level to a
 * random owned perk at contact. A Hive Core rolls its levels and their perks
 * at contact (loot stream), then waits in `World.core` while main.ts shows the
 * reveal; the player takes the levels, or the evolution when one is offered,
 * through `resolveCore`. So the draws never depend on the choice.
 */

const LEVEL_SLOTS = 5

export class CoreState {
  pending = false
  /** 1, 3 or 5 (the PRIME core: CORES.primeLevels). */
  levels = 0
  /** The perk each level goes to; 'sharpen' when no owned perk has room. */
  readonly ids: string[] = new Array<string>(LEVEL_SLOTS).fill('')
  /** The held pickup weapon and its evolution, or '' when none is offered. */
  evolveFrom = ''
  evolveTo = ''
  /** The PRIME core, granted when OVERTIME starts. */
  prime = false

  reset(): void {
    this.pending = false
    this.levels = 0
    this.evolveFrom = ''
    this.evolveTo = ''
    this.prime = false
  }
}

const ROWS = [CORES.table.mid1, CORES.table.mid2, CORES.table.overtime] as const

/** The CORES.table row of a boss stage's core. The PRIME drops none: its core
 *  comes with OVERTIME. Every boss past mid2 is an overtime boss. */
export function coreRow(stage: BossStage): number {
  return stage === 'mid1' ? 0 : stage === 'mid2' ? 1 : 2
}

/** 1, 3 or 5 levels from table row `row` (one loot draw). */
export function rollCoreLevels(w: World, row: number): number {
  const p = ROWS[row]!
  const r = w.rngs.loot.float()
  return r < p[0] ? 1 : r < p[0] + p[1] ? 3 : 5
}

/** Owned perks with room left after the levels already allotted (scratch). */
const open: string[] = []
const NO_IDS: readonly string[] = []

/** A random owned perk below its max once `ids[0..n)` are counted (one loot
 *  draw), or 'sharpen' when none has room (no draw). */
function pickOpenPerk(w: World, ids: readonly string[], n: number): string {
  open.length = 0
  for (let k = 0; k < PERKS.length; k++) {
    const p = PERKS[k]!
    const s = w.perkStacks.get(p.id) ?? 0
    if (s === 0) continue
    let a = s
    for (let i = 0; i < n; i++) if (ids[i] === p.id) a++
    if (a < p.max) open.push(p.id)
  }
  return open.length > 0 ? w.rngs.loot.pick(open) : 'sharpen'
}

/** Core shard contact: +1 level to a random owned non-maxed perk, else SHARPEN. */
export function takeShard(w: World): void {
  const id = pickOpenPerk(w, NO_IDS, 0)
  w.choosePerk(id)
  const pl = w.player
  w.feel.emit(FeelKind.Shard, 0, pl.x, pl.y, w.perkStacks.get(id) ?? 0, 0, findPerk(id) ?? null)
}

/** Hive Core contact: roll its levels from table row `row`. */
export function takeHiveCore(w: World, row: number): void {
  openCore(w, rollCoreLevels(w, row), false)
}

/** The win panel's OVERTIME grants the PRIME core: fixed levels, evolution offer. */
export function grantPrimeCore(w: World): void {
  openCore(w, CORES.primeLevels, true)
}

function openCore(w: World, levels: number, prime: boolean): void {
  const c = w.core
  c.pending = true
  c.prime = prime
  c.levels = levels
  for (let i = 0; i < levels; i++) c.ids[i] = pickOpenPerk(w, c.ids, i)
  // An evolution the base weapon already is would change nothing: not offered.
  const held = w.weapon.id === w.baseWeaponId ? null : w.weapon
  if (held && held.evolvesTo && held.evolvesTo !== w.baseWeaponId && held.pair && (w.perkStacks.get(held.pair) ?? 0) >= 2) {
    c.evolveFrom = held.id
    c.evolveTo = held.evolvesTo
  } else {
    c.evolveFrom = ''
    c.evolveTo = ''
  }
  const pl = w.player
  w.feel.emit(FeelKind.CoreOpen, 0, pl.x, pl.y, levels)
}

/** Close the reveal: the evolution (when `evolve` and one is offered) or the
 *  rolled levels, plus the core's reroll and banish either way. */
export function resolveCore(w: World, evolve: boolean): void {
  const c = w.core
  if (!c.pending) return
  c.pending = false
  if (evolve && c.evolveTo !== '') {
    evolveWeapon(w, c.evolveTo)
  } else {
    for (let i = 0; i < c.levels; i++) w.choosePerk(c.ids[i]!)
  }
  const d = w.draft
  d.rerolls = Math.min(DRAFT.maxRerolls, d.rerolls + CORES.rerollPerCore)
  d.banishes = Math.min(DRAFT.maxBanishes, d.banishes + CORES.banishPerCore)
}

/** The evolved weapon becomes the base weapon for the rest of the run (infinite
 *  ammo; later pods are temporary); a second evolution replaces the first. */
function evolveWeapon(w: World, id: string): void {
  w.baseWeaponId = id
  w.equipWeapon(id)
  w.evolutions.push(id)
  const pl = w.player
  w.feel.emit(FeelKind.Evolve, 0, pl.x, pl.y, 0, weaponIndex(id))
}
