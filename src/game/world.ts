import type { Texture } from 'pixi.js'
import {
  HASH_CELL,
  PLAYER_MAX_HP,
  SHAKE_DECAY,
  SHAKE_MAX_OFFSET,
  WEAPON_DROP_INTERVAL,
} from '../config.ts'
import { Pool } from '../core/pool.ts'
import { Rng } from '../core/rng.ts'
import { SpatialHash } from '../core/spatialHash.ts'
import { DEFAULT_WEAPON_ID, WEAPONS, type WeaponDef } from '../content/weapons.ts'
import {
  PERKS,
  baseModifiers,
  perkById,
  type Modifiers,
  type PerkDef,
} from '../content/perks.ts'
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

/**
 * Central run state: all entity pools, broad-phase hash, juice, ichor, the
 * weapon + ammo, the perk/modifier "build", and XP/level progression. Systems
 * take a `World` and mutate it. Everything resets leak-free for "one more run".
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
  readonly queryBuf: Enemy[] = []

  readonly sparkTex: Texture
  readonly gibTex: Texture

  // Weapon + perk build.
  weapon: WeaponDef = WEAPONS[DEFAULT_WEAPON_ID]!
  ammo = -1
  readonly mods: Modifiers = baseModifiers()
  readonly perkStacks = new Map<string, number>()

  // Progression.
  time = 0
  kills = 0
  deaths = 0
  level = 1
  xp = 0
  xpToNext = 1
  pendingLevelUps = 0

  // Timers / flags.
  spawnTimer = 0
  fireCooldown = 0
  weaponDropTimer = 0
  hurtFlash = 0
  pendingRestart = false
  paused = false

  constructor(
    readonly rng: Rng,
    readonly arena: Arena,
    readonly player: Player,
    readonly ichor: IchorLayer,
    layers: Layers,
    readonly texReg: TextureRegistry,
  ) {
    this.sparkTex = texReg.getTexture('particle')
    this.gibTex = texReg.getTexture('gib')

    this.enemies = new Pool<Enemy>(
      () => {
        const s = texReg.makeSprite('swarmer')
        layers.entities.addChild(s)
        return new Enemy(s)
      },
      (e) => {
        e.sprite.visible = false
        e.flash = 0
      },
      64,
    )

    this.projectiles = new Pool<Projectile>(
      () => {
        const s = texReg.makeSprite('bullet')
        layers.entities.addChild(s)
        return new Projectile(s)
      },
      (p) => {
        p.sprite.visible = false
        p.pierce = 0
        p.leavesAcid = false
      },
      128,
    )

    this.enemyProjectiles = new Pool<Projectile>(
      () => {
        const s = texReg.makeSprite('acidGlob')
        layers.entities.addChild(s)
        return new Projectile(s)
      },
      (p) => {
        p.sprite.visible = false
        p.leavesAcid = false
      },
      64,
    )

    this.particles = new Pool<Particle>(
      () => {
        const s = texReg.makeSprite('particle')
        layers.fx.addChild(s)
        return new Particle(s)
      },
      (p) => {
        p.sprite.visible = false
      },
      256,
    )

    this.floaters = new Pool<FloatingText>(
      () => {
        const f = new FloatingText()
        layers.fx.addChild(f.text)
        return f
      },
      (f) => {
        f.text.visible = false
      },
      16,
    )

    this.pickups = new Pool<Pickup>(
      () => {
        const s = texReg.makeSprite('gem')
        layers.fx.addChild(s)
        return new Pickup(s)
      },
      (p) => {
        p.sprite.visible = false
      },
      32,
    )

    this.acid = new Pool<AcidPool>(
      () => {
        const s = texReg.makeSprite('acidPool')
        layers.ichor.addChild(s) // above the ichor texture, below entities
        return new AcidPool(s)
      },
      (a) => {
        a.sprite.visible = false
      },
      16,
    )
  }

  // --- run lifecycle ---------------------------------------------------------

  /** Full fresh-run reset (used on first boot and on restart). */
  start(): void {
    this.perkStacks.clear()
    this.recomputeModifiers()
    this.equipWeapon(DEFAULT_WEAPON_ID)
    this.time = 0
    this.kills = 0
    this.level = 1
    this.xp = 0
    this.xpToNext = xpForLevel(1)
    this.pendingLevelUps = 0
    this.spawnTimer = 0
    this.fireCooldown = 0
    this.weaponDropTimer = WEAPON_DROP_INTERVAL // first pod drops after the interval
    this.hurtFlash = 0
    this.paused = false
    this.pendingRestart = false

    const b = this.arena.bounds
    this.player.spawn(b.x + b.w / 2, b.y + b.h / 2)
    this.player.hp = this.player.maxHp
  }

  /** Wipe the field and start over. Leak-free. */
  restart(): void {
    this.enemies.clear()
    this.projectiles.clear()
    this.enemyProjectiles.clear()
    this.particles.clear()
    this.floaters.clear()
    this.pickups.clear()
    this.acid.clear()
    this.ichor.clear()
    this.deaths++
    this.start()
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

  /** Apply a chosen perk and recompute the aggregate modifiers. */
  choosePerk(id: string): void {
    const cur = this.perkStacks.get(id) ?? 0
    this.perkStacks.set(id, cur + 1)
    this.recomputeModifiers()
  }

  /** Rebuild modifiers from owned perks and apply HP-affecting ones. */
  recomputeModifiers(): void {
    const m = this.mods
    Object.assign(m, baseModifiers())
    for (const [id, stacks] of this.perkStacks) perkById(id).apply(m, stacks)

    const prevMax = this.player.maxHp
    this.player.maxHp = PLAYER_MAX_HP + m.bonusHp
    const dMax = this.player.maxHp - prevMax
    if (dMax > 0) this.player.hp = Math.min(this.player.maxHp, this.player.hp + dMax)
    else this.player.hp = Math.min(this.player.hp, this.player.maxHp)
  }

  /** Draft up to 3 distinct perks (skipping maxed ones), rarity-weighted. */
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

/** XP needed to clear `level` -> level+1. Gentle early, steeper later. */
export function xpForLevel(level: number): number {
  return Math.floor(5 + level * 4 + level * level * 0.55)
}
