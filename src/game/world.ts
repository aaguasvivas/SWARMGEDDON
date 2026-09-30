import type { Texture } from 'pixi.js'
import { DASH, GRACE, HASH_CELL, MAX_HAZARDS, PODS, XP } from '../config.ts'
import { Pool } from '../core/pool.ts'
import { RunRngs, SALT, hash32 } from '../core/rng.ts'
import { hueShiftHex } from '../core/color.ts'
import { SpatialHash } from '../core/spatialHash.ts'
import { DEFAULT_WEAPON_ID, PICKUP_WEAPON_IDS, WEAPONS, WEAPON_LIST, type WeaponDef } from '../content/weapons.ts'
import { resolveScript, type ResolvedScript } from '../content/runScripts.ts'
import { PERKS, applyBuild, baseModifiers, fusionIndex, resetModifiers, type Modifiers, type PerkDef } from '../content/perks.ts'
import { CHARACTERS, type CharacterDef } from '../content/characters.ts'
import { ARENAS, type ArenaTheme } from '../content/arenas.ts'
import { ENEMY_IDS } from '../content/enemies.ts'
import { THREAT_LEVELS, threatLevel, type ThreatLevel } from '../content/threat.ts'
import { FeelKind, FeelQueue, RunAlertRing } from '../effects/feelQueue.ts'
import { Director, applyRunMuls, startOvertime } from '../systems/director.ts'
import { DraftState } from '../systems/draft.ts'
import { BossFight } from '../systems/bossAI.ts'
import { BlastQueue } from '../systems/blasts.ts'
import { CoreState } from '../systems/cores.ts'
import type { Layers } from '../render/app.ts'
import type { IchorLayer } from '../render/ichorLayer.ts'
import type { TextureRegistry } from '../render/textures.ts'
import type { Arena } from './arena.ts'
import { AcidPool } from './acidPool.ts'
import { Enemy } from './enemy.ts'
import { Hazard } from './hazard.ts'
import { Particle } from './particle.ts'
import { PICKUP_SLOT, PICKUP_SLOTS, Pickup } from './pickup.ts'
import { Player } from './player.ts'
import { Projectile } from './projectile.ts'

export type RunMode = 'endless' | 'daily'

/** Everything a run is started from (section 7.5). The sim reads the seed,
 *  mode, pilot, arena, threat and pools; the rest is run identity for
 *  presentation and the RunResult. */
export interface RunConfig {
  mode: RunMode
  /** The first Daily start of its UTC day. */
  ranked: boolean
  seed: number
  /** UTC day the run started on. */
  date: string
  /** 0 outside the Daily. */
  dailyNumber: number
  character: CharacterDef
  theme: ArenaTheme
  threat: number
  perkPool: readonly PerkDef[]
  weaponPool: readonly string[]
  paint: string
  baseBulletTint: number
}

/**
 * Central run state: entity pools, broad-phase hash, the FeelQueue, ichor, weapon+ammo,
 * the perk/Modifiers build, XP/level progression, and boss/run bookkeeping.
 * `beginRun(cfg)` (re)seeds and resets everything leak-free.
 */
export class World {
  readonly enemies: Pool<Enemy>
  readonly projectiles: Pool<Projectile>
  readonly enemyProjectiles: Pool<Projectile>
  readonly particles: Pool<Particle>
  readonly pickups: Pool<Pickup>
  readonly acid: Pool<AcidPool>

  readonly hash = new SpatialHash<Enemy>(HASH_CELL)
  /** Primary + nested scratch buffers (nested queries run inside the projectile loop). */
  readonly queryBuf: Enemy[] = []
  readonly queryBuf2: Enemy[] = []

  readonly sparkTex: Texture
  readonly gibTex: Texture
  readonly ringTex: Texture

  weapon: WeaponDef = WEAPONS[DEFAULT_WEAPON_ID]!
  /** Magazine left (-1 = infinite). A trigger pull costs weapon.fireRate over
   *  the effective fire rate, so a magazine lasts ammo / fireRate seconds
   *  whatever the fire-rate perks. */
  ammo = -1
  /** The pilot's infinite base weapon; empty finite mags revert to this. */
  baseWeaponId = DEFAULT_WEAPON_ID
  readonly mods: Modifiers = baseModifiers()
  readonly perkStacks = new Map<string, number>()

  /** Run identity: pilot (feeds the sim) + arena theme (presentation + brood). */
  character: CharacterDef = CHARACTERS[0]!
  arenaTheme: ArenaTheme = ARENAS[0]!
  private readonly tintCache = new Map<number, number>()

  mode: RunMode = 'endless'
  seed = 0
  time = 0
  kills = 0
  level = 1
  xp = 0
  xpToNext = 1
  pendingLevelUps = 0
  revivesUsed = 0

  fireCooldown = 0
  /** Seconds to the next timer pod slot (PODS.interval apart). */
  weaponDropTimer = 0

  bossAlive = false
  boss: Enemy | null = null
  warperActive = false
  /** Accumulated gravity-well drag on the player (units/sec, pre-clamped in
   *  aiSystem). Applied by player.update as a pure function of positions. */
  pullX = 0
  pullY = 0

  paused = false
  pendingGameOver = false

  // P1: foundation
  /** Every sim random draw comes from one of these streams. */
  readonly rngs = new RunRngs()
  /** Next Enemy.uid; uids are never reused within a run. */
  enemyUidSeq = 1
  /** Uids already struck by the chain being resolved (chain hop uniqueness). */
  readonly chainSeen = new Int32Array(16)
  /** Sim time of this run's first XP gem (-1 = none yet) and where it landed.
   *  Presentation reads it to show the one-time gem hint. */
  firstGemAt = -1
  firstGemX = 0
  firstGemY = 0
  /** Boss fights started this run; each reseeds the boss stream. */
  bossFights = 0
  /** Live pickups per PICKUP_SLOT, for the per-kind pool reservation. */
  readonly pickupN = new Int16Array(PICKUP_SLOTS)

  // P2: presentation boundary
  /** The sim's only output to presentation; drained once per render frame. */
  readonly feel = new FeelQueue()
  readonly alerts = new RunAlertRing()
  /** Velocity of the shot behind the damage being resolved (Kill direction);
   *  zero when the damage has no shot (thorns). */
  lastHitVx = 0
  lastHitVy = 0

  // P3: damage model and dash
  dashCharges = 1
  /** Seconds until the next charge returns; 0 while every charge is ready. */
  dashRecharge = 0
  /** A dash press waits this long (seconds) for a charge or the end of a dash. */
  dashBufferT = 0
  /** Dashes started this run; also the id of the current dash. */
  dashSeq = 0
  dashes = 0
  closeCalls = 0
  /** dashSeq of the last dash that paid a Close Call (one per dash). */
  closeCallSeq = 0
  /** HP removed by hurtPlayer this run. */
  damageTaken = 0
  /** Source of the last damage: an EnemyDef.idx, -1 unknown, -2 acid, -3 hazard. */
  lastHitBy = -1

  // P10: score, RunResult v2, stats
  /** THREAT level of this run; the score scales with it. */
  threat = 0
  score = 0
  killPts = 0
  /** def.xp of every kill (unscaled), the cap on killPts. */
  xpSum = 0
  chain = 0
  tier = 1
  bestChain = 0
  peakTier = 1
  /** Seconds since the last scoring kill; the chain halves each CHAIN_DECAY_S. */
  chainT = 0
  hits = 0
  /** `hits` when the current boss spawned: a kill with no new hits is flawless. */
  hitsAtBossSpawn = 0
  noHitTime = 0
  longestNoHit = 0
  /** Continuous damage (bites, acid) not yet counted as a hit, and seconds since the last of it. */
  contAcc = 0
  contIdle = 0
  bossesSlain = 0
  bossesFlawless = 0
  elitesSlain = 0
  podsEquipped = 0
  /** 1 per WEAPON_LIST entry equipped from a pod this run. */
  readonly weaponsUsed = new Uint8Array(WEAPON_LIST.length)
  /** Kills per ENEMY_IDS entry. */
  readonly killsByDef = new Int32Array(ENEMY_IDS.length)
  /** Sim time in ms of the kill that cleared the run; 0 while uncleared. */
  clearMs = 0

  // P4: director core
  /** The arena's run script, resolved once per run. The sim reads only this. */
  script: ResolvedScript = resolveScript(ARENAS[0]!.id)
  readonly director = new Director()
  /** Enemy damage ramp for this tick: non-boss bites, rams, enemy shots and acid. */
  dmgMul = 1
  /** Gem XP multiplier of the minute row in force (non-elite, non-boss kills). */
  xpScale = 1

  // P5: draft, perks, XP flow
  /** Draft counters, fusion states and the open draft's cached cards. */
  readonly draft = new DraftState()
  /** The perks this run may draft, in canonical order (Daily: every perk). */
  perkPool: readonly PerkDef[] = PERKS
  /** Sim time of the last level gained (SURGE counts from it). */
  lastLevelAt = 0
  /** Raw gem XP dropped and collected this run (before xpMul and SURGE). */
  xpDropped = 0
  xpCollected = 0
  /** The crimson bank gem that holds XP past XP.gemSoftCap gems, or null. */
  bankGem: Pickup | null = null
  /** Seconds left on the Adrenal Wake and Berserker medkit fire-rate windows. */
  adrenalT = 0
  berserkT = 0
  /** Magazine size of the equipped weapon, Quartermaster included (-1 = infinite). */
  ammoMax = -1

  // P14: UI foundation
  /** The additive muzzle flash quad (section 6.4). */
  readonly flashTex: Texture

  // P6a: hazards, cage, boss framework
  readonly hazards = new Pool<Hazard>(() => new Hazard(), () => {}, MAX_HAZARDS)
  /** Last Hazard.seq handed out this run. */
  hazardSeq = 0
  readonly bossFight = new BossFight()
  /** The PRIME died this run. */
  cleared = false
  /** Hand-offs to main.ts: open the win panel, or end the run as a stalemate. */
  pendingWin = false
  pendingEnd = false

  // P8: fusions, evolutions, pods
  readonly blasts = new BlastQueue()
  /** LIVING ARMOR overshield HP; absorbs damage first and never decays. */
  overshield = 0
  /** Kill healing still allowed this second (the killHealCap bucket). */
  killHealBudget = 0
  /** HIVE REAPER lock-on: the uid being hit, the consecutive hits before the
   *  last one, and the sim time of the last hit. */
  lockUid = 0
  lockN = 0
  lockAt = -1

  // P12b: feats, paints, pools
  /** Pickup weapon ids pods may drop this run, in canonical order (Daily: every one). */
  weaponPool: readonly string[] = PICKUP_WEAPON_IDS
  /** Projectile tint of the pilot's start weapon; the paint sets it. Presentation only. */
  baseBulletTint = WEAPONS[DEFAULT_WEAPON_ID]!.tint

  // P13: Daily v2
  /** The config of the current run; beginRun is its only writer. */
  run: RunConfig | null = null

  // P9: Hive Cores, shards, bonuses, pilot rules
  /** An elite kill from this sim time on drops a core shard (CORES.shardCooldown apart). */
  eliteCoreReadyAt = 0
  /** The Hive Core rolled at contact; main.ts pauses for its reveal while it is pending. */
  readonly core = new CoreState()
  /** Weapon ids evolved this run, in the order taken (RunResult.evolutions). */
  readonly evolutions: string[] = []
  /** Sim time of the last bonus drop and its BONUSES index (-1 = none yet). */
  lastBonusAt = 0
  lastBonusType = -1
  /** An elite died this run (the first elite kill always drops a bonus). */
  eliteKilled = false
  /** Seconds left on FREEZE, OVERDRIVE and SHIELD. */
  freezeT = 0
  overdriveT = 0
  shieldT = 0
  /** NOVA: pickup magazines emptied this run. */
  salvage = 0
  /** EMBER: seconds left on the post-dash damage boost. */
  afterburnT = 0
  /** VESPER: max HP grown from elite and boss kills. */
  reaperHp = 0

  // P11: THREAT and OVERTIME
  /** The run's THREAT level (world.threat), read once in beginRun. */
  threatDef: ThreatLevel = THREAT_LEVELS[0]!
  /** Enemy HP, the threat x OVERTIME damage multiplier (authored boss and
   *  hazard damage takes only this; dmgMul adds the time ramp), the min and
   *  max alive multiplier, and the OVERTIME multiplier of non-boss spawn
   *  speed and the speed ceiling. The director sets them per OVERTIME cycle. */
  hpMul = 1
  runDmgMul = 1
  aliveMul = 1
  speedMul = 1

  constructor(
    readonly arena: Arena,
    readonly player: Player,
    readonly ichor: IchorLayer,
    layers: Layers,
    readonly texReg: TextureRegistry,
  ) {
    this.sparkTex = texReg.getTexture('particle')
    this.gibTex = texReg.getTexture('gib')
    this.ringTex = texReg.getTexture('ring')
    this.flashTex = texReg.getTexture('flash')

    this.enemies = new Pool<Enemy>(
      () => { const s = texReg.makeSprite('swarmer'); layers.entities.addChild(s); return new Enemy(s) },
      (e) => { e.sprite.visible = false; e.flash = 0; e.submerged = false },
      64,
    )
    this.projectiles = new Pool<Projectile>(
      () => { const s = texReg.makeSprite('bullet'); layers.entities.addChild(s); return new Projectile(s) },
      (p) => { p.sprite.visible = false; p.pierce = 0; p.leavesAcid = false; p.bounces = 0; p.explodeRadius = 0; p.chain = 0; p.hitN = 0 },
      512,
    )
    this.enemyProjectiles = new Pool<Projectile>(
      () => { const s = texReg.makeSprite('acidGlob'); layers.entities.addChild(s); return new Projectile(s) },
      (p) => { p.sprite.visible = false; p.leavesAcid = false; p.ownerIdx = -1 },
      64,
    )
    this.particles = new Pool<Particle>(
      () => { const s = texReg.makeSprite('particle'); layers.fx.addChild(s); return new Particle(s) },
      (p) => { p.sprite.visible = false },
      256,
    )
    this.pickups = new Pool<Pickup>(
      () => { const s = texReg.makeSprite('gem'); layers.fx.addChild(s); return new Pickup(s) },
      (p) => { p.sprite.visible = false; this.pickupN[PICKUP_SLOT[p.kind]]!-- },
      256,
    )
    this.acid = new Pool<AcidPool>(
      () => { const s = texReg.makeSprite('acidPool'); layers.ichor.addChild(s); return new AcidPool(s) },
      (a) => { a.sprite.visible = false },
      16,
    )
  }

  // --- run lifecycle ---------------------------------------------------------

  /** Reseed + reset for a fresh run from `cfg` (THREAT included). The only entry point. Leak-free. */
  beginRun(cfg: RunConfig): void {
    this.clearAll()
    this.run = cfg
    this.rngs.begin(cfg.seed)
    this.seed = cfg.seed
    this.mode = cfg.mode
    this.character = cfg.character
    this.arenaTheme = cfg.theme
    this.tintCache.clear()
    this.threatDef = threatLevel(cfg.threat)
    this.threat = this.threatDef.level
    this.script = resolveScript(this.arenaTheme.id, this.threat)
    this.director.reset()
    applyRunMuls(this)
    this.dmgMul = 1
    this.xpScale = this.script.minutes[0]!.xpScale
    this.arena.setTheme(this.arenaTheme)
    this.ichor.stampTintA = this.arenaTheme.ichorA
    this.ichor.stampTintB = this.arenaTheme.ichorB
    this.player.speed = this.character.speed
    this.baseWeaponId = this.character.startWeapon
    this.perkStacks.clear()
    this.reaperHp = 0
    this.recomputeModifiers()
    this.equipWeapon(this.baseWeaponId)
    this.time = 0
    this.kills = 0
    this.level = 1
    this.xp = 0
    this.xpToNext = xpForLevel(1)
    this.pendingLevelUps = 0
    this.revivesUsed = 0
    this.fireCooldown = 0
    this.weaponDropTimer = PODS.first
    this.pullX = 0
    this.pullY = 0
    this.bossAlive = false
    this.boss = null
    this.warperActive = false
    this.paused = false
    this.pendingGameOver = false
    this.enemyUidSeq = 1
    this.firstGemAt = -1
    this.bossFights = 0
    this.feel.clear()
    this.alerts.reset()
    this.lastHitVx = 0
    this.lastHitVy = 0
    this.score = 0
    this.killPts = 0
    this.xpSum = 0
    this.chain = 0
    this.tier = 1
    this.bestChain = 0
    this.peakTier = 1
    this.chainT = 0
    this.hits = 0
    this.hitsAtBossSpawn = 0
    this.noHitTime = 0
    this.longestNoHit = 0
    this.contAcc = 0
    this.contIdle = 0
    this.bossesSlain = 0
    this.bossesFlawless = 0
    this.elitesSlain = 0
    this.podsEquipped = 0
    this.weaponsUsed.fill(0)
    this.killsByDef.fill(0)
    this.clearMs = 0
    this.dashCharges = this.maxDashCharges
    this.dashRecharge = 0
    this.dashBufferT = 0
    this.dashSeq = 0
    this.dashes = 0
    this.closeCalls = 0
    this.closeCallSeq = 0
    this.damageTaken = 0
    this.lastHitBy = -1
    this.draft.reset()
    this.perkPool = cfg.perkPool
    this.lastLevelAt = 0
    this.xpDropped = 0
    this.xpCollected = 0
    this.bankGem = null
    this.adrenalT = 0
    this.berserkT = 0
    this.hazardSeq = 0
    this.bossFight.begin('mid1')
    this.cleared = false
    this.pendingWin = false
    this.pendingEnd = false
    this.overshield = 0
    this.killHealBudget = this.mods.killHealCap
    this.lockUid = 0
    this.lockN = 0
    this.lockAt = -1
    this.weaponPool = cfg.weaponPool
    this.baseBulletTint = cfg.baseBulletTint
    this.eliteCoreReadyAt = 0
    this.core.reset()
    this.evolutions.length = 0
    this.lastBonusAt = 0
    this.lastBonusType = -1
    this.eliteKilled = false
    this.freezeT = 0
    this.overdriveT = 0
    this.shieldT = 0
    this.salvage = 0
    this.afterburnT = 0

    const b = this.arena.bounds
    this.player.spawn(b.x + b.w / 2, b.y + b.h / 2)
    this.player.hp = this.player.maxHp
  }

  private clearAll(): void {
    this.enemies.clear()
    this.projectiles.clear()
    this.enemyProjectiles.clear()
    this.particles.clear()
    this.pickups.clear()
    this.acid.clear()
    this.hazards.clear()
    this.blasts.reset()
    this.ichor.clear()
    this.bankGem = null
  }

  get maxDashCharges(): number {
    return Math.min(DASH.maxCharges, this.mods.dashCharges)
  }

  /** Grace after a draft or core reveal closes. */
  resumeFromDraft(): void {
    this.player.grantInvuln(GRACE.draft, 2)
  }

  /** The win panel's OVERTIME: the run goes on past the win. */
  startOvertime(): void {
    this.pendingWin = false
    startOvertime(this)
  }

  // --- weapons ---------------------------------------------------------------

  equipWeapon(id: string): void {
    this.weapon = WEAPONS[id]!
    this.ammo = this.weapon.ammo < 0 ? -1 : this.weapon.ammo * this.mods.ammoMul
    this.ammoMax = this.ammo
  }

  // --- XP / level ------------------------------------------------------------

  addXp(amount: number): void {
    this.xp += amount
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = xpForLevel(this.level)
      this.pendingLevelUps++
      this.lastLevelAt = this.time
      this.feel.emit(FeelKind.LevelUp, 0, this.player.x, this.player.y, this.level)
    }
  }

  choosePerk(id: string): void {
    this.perkStacks.set(id, (this.perkStacks.get(id) ?? 0) + 1)
    this.recomputeModifiers()
    const f = fusionIndex(id)
    if (f >= 0) this.feel.emit(FeelKind.Fusion, 0, this.player.x, this.player.y, 0, f)
  }

  /** Faction-shift a base color through the arena's paired brood hue (cached). */
  broodTint(color: number): number {
    const shift = this.arenaTheme.broodHueShift
    if (shift === 0) return color
    let out = this.tintCache.get(color)
    if (out === undefined) {
      out = hueShiftHex(color, shift)
      this.tintCache.set(color, out)
    }
    return out
  }

  recomputeModifiers(): void {
    const m = this.mods
    resetModifiers(m)
    // The pilot rule's base values, then perks stack on top.
    const r = this.character.rules
    m.dashCharges = r.dashCharges
    m.lifestealPerKill += r.killHeal
    m.killHealCap = r.killHealCap
    for (const [id, stacks] of this.perkStacks) applyBuild(m, id, stacks)

    const prevMax = this.player.maxHp
    this.player.maxHp = Math.max(10, Math.round(this.character.maxHp * m.hpMul + m.bonusHp + this.reaperHp))
    const dMax = this.player.maxHp - prevMax
    if (dMax > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dMax)
    else this.player.hp = Math.min(this.player.hp, this.player.maxHp)
  }

  /** Start a boss fight: the boss stream is reseeded per fight. */
  beginBossFight(): void {
    this.rngs.boss.reseed(hash32(this.seed, SALT.boss, this.bossFights))
    this.bossFights++
    this.hitsAtBossSpawn = this.hits
  }
}

/** XP needed to clear `level` -> level+1 (A6). */
export function xpForLevel(level: number): number {
  return level === 1 ? XP.firstLevelCost : Math.floor(XP.a + XP.b * level + XP.c * level * level)
}
