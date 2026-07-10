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
    this.paint({ body: COLORS.player, outline: COLORS.playerOutline, visor: COLORS.playerVisor, barrel: COLORS.playerBarrel }, 'vanguard')
  }

  /**
   * Repaint the ship in a pilot's colors + hull silhouette (presentation only —
   * the hitbox is PLAYER_RADIUS for every shape). Each hull says what the pilot
   * IS at a glance: vanguard = round + side pods, dart = swept speed wedge,
   * heavy = wide armored hex. The barrel stub is shared so facing always reads.
   */
  paint(colors: CharacterDef['colors'], shape: CharacterDef['shape'] = 'vanguard'): void {
    const g = this.g
    const r = PLAYER_RADIUS
    g.clear()
    // Barrel stub (drawn first so the hull overlaps its root).
    g.rect(r * 0.5, -3.5, r * 1.0, 7).fill(colors.barrel)

    if (shape === 'dart') {
      // EMBER — a swept wedge with a notched tail and twin exhaust embers.
      g.poly([r * 1.3, 0, -r * 0.95, -r * 0.8, -r * 0.45, 0, -r * 0.95, r * 0.8])
        .fill(colors.body)
        .stroke({ width: 3, color: colors.outline, join: 'round' })
      // Canopy slit, swept toward the nose.
      g.ellipse(r * 0.32, 0, r * 0.42, r * 0.26).fill(colors.visor)
      // Exhaust embers at the tail notches (bright enough to catch the bloom).
      g.circle(-r * 0.78, -r * 0.44, 2.4).fill(0xffd27a)
      g.circle(-r * 0.78, r * 0.44, 2.4).fill(0xffd27a)
    } else if (shape === 'heavy') {
      // VESPER — a wide armored hex with an inner plate and a scythe visor.
      const R = r * 1.12
      const pts: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i
        pts.push(Math.cos(a) * R, Math.sin(a) * R)
      }
      g.poly(pts).fill(colors.body).stroke({ width: 3, color: colors.outline, join: 'round' })
      // Inner armor plate (smaller hex, barrel tone).
      const inner: number[] = []
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i
        inner.push(Math.cos(a) * R * 0.62, Math.sin(a) * R * 0.62)
      }
      g.poly(inner).fill({ color: colors.barrel, alpha: 0.85 })
      // Scythe visor: a dark disc with a body-colored bite carved out of it.
      g.circle(r * 0.4, 0, r * 0.44).fill(colors.visor)
      g.circle(r * 0.12, 0, r * 0.34).fill({ color: colors.barrel, alpha: 0.85 })
    } else {
      // NOVA — the classic round hull, plus twin side pods and a faint
      // magnet-coil ring (her passive made visible).
      g.circle(0, -r * 0.86, r * 0.34).fill(colors.barrel)
      g.circle(0, r * 0.86, r * 0.34).fill(colors.barrel)
      g.circle(0, 0, r).fill(colors.body)
      g.circle(0, 0, r).stroke({ width: 3, color: colors.outline })
      g.circle(r * 0.34, 0, r * 0.42).fill(colors.visor)
      g.circle(0, 0, r * 1.28).stroke({ width: 1.5, color: colors.body, alpha: 0.4 })
    }
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
