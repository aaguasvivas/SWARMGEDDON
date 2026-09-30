import type { Sprite } from 'pixi.js'
import type { EnemyDef } from '../content/enemies.ts'
import { ENEMIES } from '../content/enemies.ts'
import { doubleFields } from '../core/fields.ts'
import type { Poolable } from '../core/pool.ts'

/**
 * A hive creature. Pure data + a persistent Sprite (texture swapped per type on
 * spawn). `def` points at the registry entry the AI/render/death code reads, so
 * one pool serves every enemy type. Systems mutate the live fields.
 */
export class Enemy implements Poolable {
  alive = false
  /** Run-unique id (World.enemyUidSeq), stable while this pooled object lives. */
  uid = 0

  /** Registry definition for this enemy's type (set on spawn). */
  def: EnemyDef = ENEMIES.swarmer!

  x = 0
  y = 0
  prevX = 0
  prevY = 0
  vx = 0
  vy = 0

  facing = 0
  prevFacing = 0

  hp = 1
  maxHp = 1
  radius = 14
  speed = 70
  damage = 22

  /** Ranged cooldown / brood cooldown (seconds until next shot/spawn). */
  fireTimer = 0
  /** Generic behavior timer (burrow phase, teleport cooldown). */
  stateTimer = 0
  /** Hit-flash timer (seconds remaining). */
  flash = 0
  /** Aura buff remaining (seconds); set by nearby hive minds. */
  buffed = 0
  /** Strength of the active aura buff (stamped by the aura source's def). */
  buffedMul = 1
  /** Generic state-machine phase (charger: 0 stalk, 1 windup, 2 dash, 3 recover). */
  phase = 0
  /** Locked heading for phase-driven moves (radians; charger dash line). */
  phaseDir = 0
  /** Charger: whether the current dash has already landed its one ram hit. */
  dashHit = false
  /** Cryo slow remaining (seconds) + its strength (0..1). */
  slow = 0
  slowFactor = 0
  /** Burn remaining (seconds) and its damage per second, final before
   *  elite/boss multipliers. */
  burnT = 0
  burnDps = 0
  /** The burn came from a FIREBLAST shot: its kill drops no bonus (set by every ignite). */
  burnNoBonus = false
  /** Overpressure stagger remaining (seconds): no movement while > 0. */
  staggerT = 0
  /** World.dashSeq of the dash that last rammed this enemy (RAM, once per dash). */
  ramStamp = 0
  /** Underground (burrower) or still emerging (boss): intangible, no contact damage. */
  submerged = false
  /** Boss fight (World.bossFights) this enemy was spawned into as brood, 0 for
   *  none. The fight's own brood may stay inside its cage. */
  brood = 0
  /** Per-enemy phase offset so the swarm doesn't wobble in lockstep. */
  animPhase = 0
  /** Sim time this enemy spawned; drives the cosmetic emerge fade (render-only read). */
  bornAt = 0
  /** Faction-shifted body/gib colors, resolved at spawn (presentation only). */
  tint = 0xffffff
  gibTint = 0xffffff

  /** Front armor fraction: the def's, or SHIELDED's. */
  armor = 0
  /** Elite affix bits (content/affixes.ts AF_*). */
  affix = 0
  /** MOLTEN: seconds to the next pool. */
  affixT = 0
  /** BROOD: the half-HP burst already happened. */
  halfBurst = false
  /** Spawned by a swarm event. */
  eventUnit = false
  /** STREAM mode: heading `phaseDir` at `speed`, no seek or separation, gone
   *  with no credit after `ttl` seconds or outside the arena. The lateral wobble
   *  velocity is wobAmp * cos(wobFreq * age + wobPhase). */
  stream = false
  ttl = 0
  wobAmp = 0
  wobFreq = 0
  wobPhase = 0

  constructor(readonly sprite: Sprite) {
    doubleFields(this)
  }
}
