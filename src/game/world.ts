import type { Texture } from 'pixi.js'
import {
  HASH_CELL,
  PLAYER_MAX_HP,
  SHAKE_DECAY,
  SHAKE_MAX_OFFSET,
} from '../config.ts'
import { Pool } from '../core/pool.ts'
import { Rng } from '../core/rng.ts'
import { SpatialHash } from '../core/spatialHash.ts'
import { DEFAULT_WEAPON, type WeaponDef } from '../content/weapons.ts'
import { Juice } from '../effects/juice.ts'
import type { Layers } from '../render/app.ts'
import type { IchorLayer } from '../render/ichorLayer.ts'
import type { TextureRegistry } from '../render/textures.ts'
import type { Arena } from './arena.ts'
import { Enemy } from './enemy.ts'
import { FloatingText } from './floatingText.ts'
import { Particle } from './particle.ts'
import { Player } from './player.ts'
import { Projectile } from './projectile.ts'

/**
 * Central run state: all entity pools, the broad-phase hash, juice, the ichor
 * layer, and the run scalars (time/kills/weapon/cooldowns). Systems take a
 * `World` and mutate it. `restart()` resets everything leak-free for "one more
 * run".
 */
export class World {
  readonly enemies: Pool<Enemy>
  readonly projectiles: Pool<Projectile>
  readonly particles: Pool<Particle>
  readonly floaters: Pool<FloatingText>

  readonly hash = new SpatialHash<Enemy>(HASH_CELL)
  readonly juice = new Juice(SHAKE_MAX_OFFSET, SHAKE_DECAY)
  /** Reused scratch buffer for spatial-hash queries (no per-query allocation). */
  readonly queryBuf: Enemy[] = []

  /** Particle frames, looked up once so fx.ts can swap a pooled sprite's texture. */
  readonly sparkTex: Texture
  readonly gibTex: Texture

  weapon: WeaponDef = DEFAULT_WEAPON
  time = 0
  kills = 0
  deaths = 0
  spawnTimer = 0
  fireCooldown = 0
  hurtFlash = 0
  pendingRestart = false

  constructor(
    readonly rng: Rng,
    readonly arena: Arena,
    readonly player: Player,
    readonly ichor: IchorLayer,
    layers: Layers,
    texReg: TextureRegistry,
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
      },
      128,
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
  }

  /** Begin a run: center the player at full health. */
  start(): void {
    const b = this.arena.bounds
    this.player.spawn(b.x + b.w / 2, b.y + b.h / 2)
    this.player.hp = PLAYER_MAX_HP
  }

  /** Wipe the field and start over (death / manual restart). Leak-free. */
  restart(): void {
    this.enemies.clear()
    this.projectiles.clear()
    this.particles.clear()
    this.floaters.clear()
    this.ichor.clear()
    this.time = 0
    this.kills = 0
    this.spawnTimer = 0
    this.fireCooldown = 0
    this.hurtFlash = 0
    this.deaths++
    this.start()
  }
}
