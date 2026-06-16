import type { Texture } from 'pixi.js'
import { HASH_CELL, PLAYER_MAX_HP, SHAKE_DECAY, SHAKE_MAX_OFFSET, WEAPON_DROP_INTERVAL } from '../config.ts'
import { Pool } from '../core/pool.ts'
import { Rng } from '../core/rng.ts'
import { SpatialHash } from '../core/spatialHash.ts'
import { DEFAULT_WEAPON_ID, WEAPONS, type WeaponDef } from '../content/weapons.ts'
import { BOSS_FIRST } from '../content/waveDirector.ts'
import { PERKS, baseModifiers, perkById, type Modifiers, type PerkDef } from '../content/perks.ts'
import type { AudioEngine } from '../audio/audio.ts'
import { loadJSON } from '../platform/storage.ts'
import { Juice } from '../effects/juice.ts'
import type { Layers } from '../render/app.ts'
import type { IchorLayer } from '../render/ichorLayer.ts'
import type { TextureRegistry } from '../render/textures.ts'
import type { Arena } from './arena.ts'
import { AcidPool } from './acidPool.ts'
import { Enemy } from './enemy.ts'
import { FloatingText } from './floatingText.ts'
import { Particle } from './particle.ts'
import { Pickup } from './pickup.ts'
import { Player } from './player.ts'
import { Projectile } from './projectile.ts'

export type RunMode = 'endless' | 'daily'

/**
 * Central run state: entity pools, broad-phase hash, juice, ichor, weapon+ammo,
 * the perk/Modifiers build, XP/level progression, and boss/run bookkeeping.
 * `beginRun(seed, mode)` (re)seeds and resets everything leak-free.
 */
export class World {
  readonly enemies: Pool<Enemy>
  readonly projectiles: Pool<Projectile>
  readonly enemyProjectiles: Pool<Projectile>
  readonly particles: Pool<Particle>
  readonly floaters: Pool<FloatingText>
  readonly pickups: Pool<Pickup>
  readonly acid: Pool<AcidPool>

  readonly hash = new SpatialHash<Enemy>(HASH_CELL)
  readonly juice = new Juice(SHAKE_MAX_OFFSET, SHAKE_DECAY)
  /** Primary + nested scratch buffers (nested queries run inside the projectile loop). */
  readonly queryBuf: Enemy[] = []
  readonly queryBuf2: Enemy[] = []

  readonly sparkTex: Texture
  readonly gibTex: Texture

  weapon: WeaponDef = WEAPONS[DEFAULT_WEAPON_ID]!
  ammo = -1
  readonly mods: Modifiers = baseModifiers()
  readonly perkStacks = new Map<string, number>()

  mode: RunMode = 'endless'
  seed = 0
  time = 0
  kills = 0
  level = 1
  xp = 0
  xpToNext = 1
  pendingLevelUps = 0
  revivesUsed = 0

  spawnTimer = 0
  fireCooldown = 0
  weaponDropTimer = 0
  eliteTimer = 0
  bossTimer = 0
  hurtFlash = 0

  bossAlive = false
  boss: Enemy | null = null
  warperActive = false

  paused = false
  pendingGameOver = false
  /** Show the one-time "collect for XP" hint on the first gem (until seen once). */
  showGemHint = false

  constructor(
    readonly rng: Rng,
    readonly arena: Arena,
    readonly player: Player,
    readonly ichor: IchorLayer,
    readonly audio: AudioEngine,
    layers: Layers,
    readonly texReg: TextureRegistry,
  ) {
    this.sparkTex = texReg.getTexture('particle')
    this.gibTex = texReg.getTexture('gib')

    this.enemies = new Pool<Enemy>(
      () => { const s = texReg.makeSprite('swarmer'); layers.entities.addChild(s); return new Enemy(s) },
      (e) => { e.sprite.visible = false; e.flash = 0; e.submerged = false },
      64,
    )
    this.projectiles = new Pool<Projectile>(
      () => { const s = texReg.makeSprite('bullet'); layers.entities.addChild(s); return new Projectile(s) },
      (p) => { p.sprite.visible = false; p.pierce = 0; p.leavesAcid = false; p.bounces = 0; p.explodeRadius = 0; p.chain = 0 },
      128,
    )
    this.enemyProjectiles = new Pool<Projectile>(
      () => { const s = texReg.makeSprite('acidGlob'); layers.entities.addChild(s); return new Projectile(s) },
      (p) => { p.sprite.visible = false; p.leavesAcid = false },
      64,
    )
    this.particles = new Pool<Particle>(
      () => { const s = texReg.makeSprite('particle'); layers.fx.addChild(s); return new Particle(s) },
      (p) => { p.sprite.visible = false },
      256,
    )
    this.floaters = new Pool<FloatingText>(
      () => { const f = new FloatingText(); layers.fx.addChild(f.text); return f },
      (f) => { f.text.visible = false },
      16,
    )
    this.pickups = new Pool<Pickup>(
      () => { const s = texReg.makeSprite('gem'); layers.fx.addChild(s); return new Pickup(s) },
      (p) => { p.sprite.visible = false },
      32,
    )
    this.acid = new Pool<AcidPool>(
      () => { const s = texReg.makeSprite('acidPool'); layers.ichor.addChild(s); return new AcidPool(s) },
      (a) => { a.sprite.visible = false },
      16,
    )
  }

  // --- run lifecycle ---------------------------------------------------------

  /** Reseed + reset for a fresh run of `mode`. Leak-free. */
  beginRun(seed: number, mode: RunMode): void {
    this.clearAll()
    this.rng.reseed(seed)
    this.seed = seed
    this.mode = mode
    this.perkStacks.clear()
    this.recomputeModifiers()
    this.equipWeapon(DEFAULT_WEAPON_ID)
    this.time = 0
    this.kills = 0
    this.level = 1
    this.xp = 0
    this.xpToNext = xpForLevel(1)
    this.pendingLevelUps = 0
    this.revivesUsed = 0
    this.spawnTimer = 0
    this.fireCooldown = 0
    this.weaponDropTimer = WEAPON_DROP_INTERVAL
    this.eliteTimer = 0
    this.bossTimer = BOSS_FIRST
    this.hurtFlash = 0
    this.bossAlive = false
    this.boss = null
    this.warperActive = false
    this.paused = false
    this.pendingGameOver = false
    this.showGemHint = !loadJSON('seenGemHint', false)

    const b = this.arena.bounds
    this.player.spawn(b.x + b.w / 2, b.y + b.h / 2)
    this.player.hp = this.player.maxHp
  }

  private clearAll(): void {
    this.enemies.clear()
    this.projectiles.clear()
    this.enemyProjectiles.clear()
    this.particles.clear()
    this.floaters.clear()
    this.pickups.clear()
    this.acid.clear()
    this.ichor.clear()
  }

  get score(): number {
    return Math.floor(this.time * 10 + this.kills * 5 + this.level * 50)
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
    }
  }

  choosePerk(id: string): void {
    this.perkStacks.set(id, (this.perkStacks.get(id) ?? 0) + 1)
    this.recomputeModifiers()
  }

  recomputeModifiers(): void {
    const m = this.mods
    Object.assign(m, baseModifiers())
    for (const [id, stacks] of this.perkStacks) perkById(id).apply(m, stacks)

    const prevMax = this.player.maxHp
    this.player.maxHp = Math.max(10, Math.round(PLAYER_MAX_HP * m.hpMul + m.bonusHp))
    const dMax = this.player.maxHp - prevMax
    if (dMax > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dMax)
    else this.player.hp = Math.min(this.player.hp, this.player.maxHp)
  }

  draftPerks(): PerkDef[] {
    const avail = PERKS.filter((p) => (this.perkStacks.get(p.id) ?? 0) < p.maxStacks)
    const bag: PerkDef[] = []
    for (const p of avail) {
      const w = p.rarity === 'rare' ? 1 : 3
      for (let i = 0; i < w; i++) bag.push(p)
    }
    const chosen: PerkDef[] = []
    const used = new Set<string>()
    let guard = 0
    while (chosen.length < 3 && used.size < avail.length && guard++ < 300) {
      const p = this.rng.pick(bag)
      if (!used.has(p.id)) {
        used.add(p.id)
        chosen.push(p)
      }
    }
    return chosen
  }
}

/** XP needed to clear `level` -> level+1. */
export function xpForLevel(level: number): number {
  return Math.floor(5 + level * 4 + level * level * 0.55)
}
