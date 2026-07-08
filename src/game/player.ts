import { Container, Graphics } from 'pixi.js'
import { COLORS, PLAYER_MAX_HP, PLAYER_RADIUS, PLAYER_SPEED } from '../config.ts'
import { clamp, lerp, type Vec2 } from '../core/vec.ts'
import type { CharacterDef } from '../content/characters.ts'
import type { Bounds } from './arena.ts'

/**
 * The lone survivor. Phase-0 placeholder art: a teal body, a darker "visor"
 * offset toward the muzzle, and a barrel stub so facing reads instantly. Real
 * illustrated sprites slot in later with zero change to this update logic.
 *
 * Simulation state (x/y/facing) is integrated in `update()` at the fixed step;
 * `prev*` snapshots let `render(alpha)` interpolate for judder-free motion.
 */
export class Player {
  readonly view = new Container()

  x = 0
  y = 0
  facing = 0 // radians; 0 = pointing +x (right)

  private prevX = 0
  private prevY = 0

  readonly radius = PLAYER_RADIUS
  /** Base move speed — set per pilot at run start. */
  speed = PLAYER_SPEED
  hp = PLAYER_MAX_HP
  maxHp = PLAYER_MAX_HP

  private g = new Graphics()

  constructor() {
    this.view.addChild(this.g)
    this.paint({ body: COLORS.player, outline: COLORS.playerOutline, visor: COLORS.playerVisor, barrel: COLORS.playerBarrel })
  }

  /** Repaint the ship in a pilot's colors (presentation only). */
  paint(colors: CharacterDef['colors']): void {
    const g = this.g
    const r = PLAYER_RADIUS
    g.clear()
    // Barrel stub (drawn first so the body overlaps its root).
    g.rect(r * 0.5, -3.5, r * 1.0, 7).fill(colors.barrel)
    // Body.
    g.circle(0, 0, r).fill(colors.body)
    g.circle(0, 0, r).stroke({ width: 3, color: colors.outline })
    // Visor toward the front (+x), so orientation is obvious.
    g.circle(r * 0.34, 0, r * 0.42).fill(colors.visor)
  }

  /** Place the player and zero the interpolation history. */
  spawn(x: number, y: number): void {
    this.x = this.prevX = x
    this.y = this.prevY = y
    this.facing = 0
    this.view.position.set(x, y)
  }

  /**
   * Fixed-step update. `move` is a vector with magnitude <= 1 (already
   * deadzoned/normalized by the input layer); `aimDir` is a unit facing
   * direction, or (0,0) to leave facing unchanged.
   */
  update(dt: number, move: Vec2, aimDir: Vec2, bounds: Bounds, speedMul = 1, pullX = 0, pullY = 0): void {
    this.prevX = this.x
    this.prevY = this.y

    const sp = this.speed * speedMul
    // Gravity-well drag adds to (never replaces) stick input; it's pre-clamped
    // well below any pilot's speed, so the player can always fight out of it.
    this.x += (move.x * sp + pullX) * dt
    this.y += (move.y * sp + pullY) * dt

    // Clamp inside the arena, accounting for body radius.
    this.x = clamp(this.x, bounds.x + this.radius, bounds.x + bounds.w - this.radius)
    this.y = clamp(this.y, bounds.y + this.radius, bounds.y + bounds.h - this.radius)

    if (aimDir.x !== 0 || aimDir.y !== 0) {
      this.facing = Math.atan2(aimDir.y, aimDir.x)
    }
  }

  /** Interpolated render between the last two sim steps. Position interpolates
   *  for smoothness, but the barrel snaps straight to the aim so fast turns and
   *  spinning to shoot in all directions feel crisp (no rotational lag). */
  render(alpha: number): void {
    this.view.x = lerp(this.prevX, this.x, alpha)
    this.view.y = lerp(this.prevY, this.y, alpha)
    this.view.rotation = this.facing
  }
}
