import type { Texture } from 'pixi.js'
import { DASH, GRACE, HASH_CELL } from '../config.ts'
import { Pool } from '../core/pool.ts'
import { RunRngs, SALT, hash32 } from '../core/rng.ts'
import { hueShiftHex } from '../core/color.ts'
import { SpatialHash } from '../core/spatialHash.ts'
import { DEFAULT_WEAPON_ID, WEAPONS, WEAPON_LIST, type WeaponDef } from '../content/weapons.ts'
import { resolveScript, type ResolvedScript } from '../content/runScripts.ts'
import { PERKS, baseModifiers, perkById, type Modifiers, type PerkDef } from '../content/perks.ts'
import { CHARACTERS, type CharacterDef } from '../content/characters.ts'
import { ARENAS, type ArenaTheme } from '../content/arenas.ts'
import { ENEMY_IDS } from '../content/enemies.ts'
import { FeelKind, FeelQueue, RunAlertRing } from '../effects/feelQueue.ts'
import { Director } from '../systems/director.ts'
import type { Layers } from '../render/app.ts'
import type { IchorLayer } from '../render/ichorLayer.ts'
import type { TextureRegistry } from '../render/textures.ts'
import type { Arena } from './arena.ts'
import { AcidPool } from './acidPool.ts'
import { Enemy } from './enemy.ts'
import { Particle } from './particle.ts'
import { PICKUP_SLOT, PICKUP_SLOTS, Pickup } from './pickup.ts'
import { Player } from './player.ts'
import { Projectile } from './projectile.ts'

export type RunMode = 'endless' | 'daily'

/**
 * Central run state: entity pools, broad-phase hash, the FeelQueue, ichor, weapon+ammo,
 * the perk/Modifiers build, XP/level progression, and boss/run bookkeeping.
 * `beginRun(seed, mode)` (re)seeds and resets everything leak-free.
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
  /** Drafts opened this run; each open reseeds the draft stream from it. */
  draftIndex = 0
  /** Cards of the open draft, rolled once per open and reused until the pick. */
  readonly draftCards: PerkDef[] = []
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

  // P14: UI foundation
  /** The additive muzzle flash quad (section 6.4). */
  readonly flashTex: Texture

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

  /** Reseed + reset for a fresh run of `mode` as `character` in `theme`. Leak-free. */
  beginRun(seed: number, mode: RunMode, character?: CharacterDef, theme?: ArenaTheme): void {
    this.clearAll()
    this.rngs.begin(seed)
    this.seed = seed
    this.mode = mode
    if (character) this.character = character
    if (theme) this.arenaTheme = theme
    this.tintCache.clear()
    this.script = resolveScript(this.arenaTheme.id)
    this.director.reset()
    this.dmgMul = 1
    this.xpScale = this.script.minutes[0]!.xpScale
    this.arena.setTheme(this.arenaTheme)
    this.ichor.stampTintA = this.arenaTheme.ichorA
    this.ichor.stampTintB = this.arenaTheme.ichorB
    this.player.paint(this.character.colors, this.character.shape)
    this.player.speed = this.character.speed
    this.baseWeaponId = this.character.startWeapon
    this.perkStacks.clear()
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
    this.weaponDropTimer = 7 // first weapon pod comes early so a slow start isn't brutal
    this.pullX = 0
    this.pullY = 0
    this.bossAlive = false
    this.boss = null
    this.warperActive = false
    this.paused = false
    this.pendingGameOver = false
    this.enemyUidSeq = 1
    this.firstGemAt = -1
    this.draftIndex = 0
    this.draftCards.length = 0
    this.bossFights = 0
    this.feel.clear()
    this.alerts.reset()
    this.lastHitVx = 0
    this.lastHitVy = 0
    this.threat = 0
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
    this.ichor.clear()
  }

  get maxDashCharges(): number {
    return Math.min(DASH.maxCharges, this.mods.dashCharges)
  }

  /** Grace after a draft or core reveal closes. */
  resumeFromDraft(): void {
    this.player.grantInvuln(GRACE.draft, 2)
  }

  // --- weapons ---------------------------------------------------------------

  equipWeapon(id: string): void {
    this.weapon = WEAPONS[id]!
    this.ammo = this.weapon.ammo
  }

  // --- XP / level ------------------------------------------------------------

  addXp(amount: number): void {
    this.xp += amount
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext
      this.level++
      this.xpToNext = xpForLevel(this.level)
      this.pendingLevelUps++
      this.feel.emit(FeelKind.LevelUp, 0, this.player.x, this.player.y, this.level)
    }
  }

  choosePerk(id: string): void {
    this.perkStacks.set(id, (this.perkStacks.get(id) ?? 0) + 1)
    this.recomputeModifiers()
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
    Object.assign(m, baseModifiers())
    this.character.applyPassive(m) // pilot signature passive, then perks stack on top
    for (const [id, stacks] of this.perkStacks) perkById(id).apply(m, stacks)

    const prevMax = this.player.maxHp
    this.player.maxHp = Math.max(10, Math.round(this.character.maxHp * m.hpMul + m.bonusHp))
    const dMax = this.player.maxHp - prevMax
    if (dMax > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dMax)
    else this.player.hp = Math.min(this.player.hp, this.player.maxHp)
  }

  /** Roll the next draft into `draftCards` (up to 3) and return the count.
   *  Called once per draft open; the cards stay fixed until the pick. */
  rollDraft(): number {
    this.draftIndex++
    const rng = this.rngs.draft
    rng.reseed(hash32(this.seed, SALT.draft, this.draftIndex * 64, 0))
    const avail = PERKS.filter((p) => (this.perkStacks.get(p.id) ?? 0) < p.maxStacks)
    const bag: PerkDef[] = []
    for (const p of avail) {
      const w = p.rarity === 'rare' ? 1 : 3
      for (let i = 0; i < w; i++) bag.push(p)
    }
    const cards = this.draftCards
    cards.length = 0
    let guard = 0
    while (cards.length < 3 && cards.length < avail.length && guard++ < 300) {
      const p = rng.pick(bag)
      if (!cards.includes(p)) cards.push(p)
    }
    return cards.length
  }

  /** Start a boss fight: the boss stream is reseeded per fight. */
  beginBossFight(): void {
    this.rngs.boss.reseed(hash32(this.seed, SALT.boss, this.bossFights))
    this.bossFights++
    this.hitsAtBossSpawn = this.hits
  }
}

/** XP needed to clear `level` -> level+1. */
export function xpForLevel(level: number): number {
  return Math.floor(5 + level * 4 + level * level * 0.55)
}
