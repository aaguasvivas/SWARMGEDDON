import type { AudioEngine } from '../audio/audio.ts'
import { COLORS } from '../config.ts'
import type { EnemyDef } from '../content/enemies.ts'
import { WEAPON_LIST } from '../content/weapons.ts'
import type { World } from '../game/world.ts'
import type { InputManager } from '../input/input.ts'
import { buzz } from '../platform/haptics.ts'
import { announce, spawnDamageNumber } from './fx.ts'
import { AlertKind, FF_ACID, FF_BOSS, FF_CONTACT, FF_CRIT, FF_ELITE, FF_RAM, FeelKind } from './feelQueue.ts'
import { Shake } from './shake.ts'
import { TimeDirector, TimePreset } from './timeDirector.ts'

/** The window the last frame showed, in world units. */
export interface ViewRect {
  x: number
  y: number
  w: number
  h: number
}

const ON_SCREEN_PAD = 90
const EXPLOSION_GAP_MS = 80
/** One bite of screen feedback per bite window (A1.1 BITE.window). */
const BITE_GAP_MS = 400
const BIG_HIT = 15
const HITSTOP_BIG_HIT_MS = 40
const HITSTOP_ELITE_MS = 50
const HITSTOP_REVIVE_MS = 120
/** A16.3: a dash kicks the view this far along its heading. */
const DASH_KICK_PX = 4

/**
 * Turns the sim's FeelQueue into sound, shake, flashes, floating text and time
 * effects. Runs once per render frame; everything it owns is presentation, so
 * settings and frame rate can change how a run looks and sounds, never how it
 * plays.
 */
export class FeelDirector {
  /** Red hurt overlay strength, decays on the real clock. */
  hurtFlash = 0
  readonly shake = new Shake()
  readonly time = new TimeDirector()
  private biteAt = -Infinity
  private blastAt = -Infinity

  constructor(
    private readonly world: World,
    private readonly audio: AudioEngine,
    private readonly input: InputManager,
  ) {}

  reset(): void {
    this.hurtFlash = 0
    this.shake.reset()
    this.time.reset()
    this.biteAt = -Infinity
    this.blastAt = -Infinity
  }

  /** Play every event emitted since the last frame, then empty the queue.
   *  `nowMs` is the real render clock. */
  drain(nowMs: number, view: ViewRect): void {
    const q = this.world.feel
    const n = q.n
    for (let i = 0; i < n; i++) {
      const x = q.x[i]!
      const y = q.y[i]!
      const a = q.a[i]!
      const b = q.b[i]!
      const f = q.flags[i]!
      switch (q.kind[i] as FeelKind) {
        case FeelKind.Shot: {
          const w = WEAPON_LIST[b]
          if (!w) break
          this.audio.play(w.sfx)
          this.shake.kick(-Math.cos(a) * w.kickPx, -Math.sin(a) * w.kickPx)
          break
        }
        case FeelKind.Hit:
          spawnDamageNumber(this.world, x, y, a, (f & FF_CRIT) !== 0, b)
          this.audio.play('hit')
          break
        case FeelKind.Kill:
          this.onKill(x, y, f, q.ref[i] as EnemyDef, view)
          break
        case FeelKind.Explosion:
          this.audio.play('heavy')
          if (nowMs - this.blastAt >= EXPLOSION_GAP_MS) {
            this.blastAt = nowMs
            this.shake.add(0.1, 0.35)
            this.kickFrom(x, y, 3)
          }
          break
        case FeelKind.PlayerHurt:
          this.onHurt(x, y, a, f, nowMs)
          break
        case FeelKind.PlayerDeath:
          this.hurtFlash = 1
          this.shake.add(0.9, 1)
          this.audio.play('death')
          buzz(150)
          this.input.rumble(320, 0.9)
          break
        case FeelKind.Revive:
          this.hurtFlash = 1
          this.shake.add(0.7, 1)
          this.audio.play('levelup')
          this.input.rumble(120, 0.5)
          this.time.hitStop(HITSTOP_REVIVE_MS, true)
          this.time.play(TimePreset.Revive)
          announce(this.world, 'SECOND WIND', x, y - 30, 0x7dffd6)
          break
        case FeelKind.GemCollect:
          this.audio.play('pickup')
          break
        case FeelKind.HealCollect: {
          this.audio.play('pickup')
          const gained = Math.round(a)
          if (gained > 0) announce(this.world, `+${gained}`, x, y - 24, COLORS.health)
          break
        }
        case FeelKind.WeaponPickup: {
          const w = WEAPON_LIST[b]
          this.audio.play('weapon')
          this.shake.add(0.1, 0.35)
          if (w) announce(this.world, w.name, x, y - 26, w.tint)
          break
        }
        case FeelKind.EliteSpawn:
          this.shake.add(0.2, 1)
          break
        case FeelKind.BossSpawn:
          this.audio.play('boss')
          this.shake.add(0.55, 1)
          this.time.play(TimePreset.BossIntro)
          break
        case FeelKind.BossPhase:
          this.audio.play('boss')
          this.shake.add(0.45, 1)
          break
        case FeelKind.BossKill:
          this.shake.add(0.85, 1)
          this.time.play(TimePreset.BossKill)
          announce(this.world, this.world.arenaTheme.slainText, x, y - 36, 0xffe066)
          break
        case FeelKind.Dash:
          this.shake.kick(a * DASH_KICK_PX, b * DASH_KICK_PX)
          break
        case FeelKind.CloseCall:
          this.time.play(TimePreset.CloseCall)
          announce(this.world, 'CLOSE CALL', x, y - 30, 0x7dffd6)
          break
        case FeelKind.Alert:
          this.onAlert(x, y, b)
          break
      }
    }
    q.clear()
  }

  /** Advance real-time decays by `fd` seconds. */
  update(fd: number): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - fd * 2.2)
  }

  private onKill(x: number, y: number, f: number, def: EnemyDef, view: ViewRect): void {
    this.audio.play('kill')
    if (f & FF_BOSS) return
    const on = onScreen(x, y, view)
    if (f & FF_ELITE) {
      if (on) {
        this.shake.add(0.4, 1)
        this.time.hitStop(HITSTOP_ELITE_MS)
      } else {
        this.shake.add(0.05, 0.35)
      }
    } else if (def.xp <= 1) {
      this.shake.add(0.015, 0.25)
    } else if (on) {
      this.shake.add(0.04, 0.35)
    }
  }

  private onHurt(x: number, y: number, hp: number, f: number, nowMs: number): void {
    if (f & FF_ACID) {
      this.hurtFlash = Math.min(0.6, this.hurtFlash + hp * 0.04)
      this.shake.add(0.008, 0.25)
      return
    }
    if (f & FF_CONTACT) {
      this.hurtFlash = Math.min(0.7, this.hurtFlash + hp * 0.05)
      if (nowMs - this.biteAt >= BITE_GAP_MS) {
        this.biteAt = nowMs
        this.shake.add(0.05, 0.3)
        this.kickFrom(x, y, 2)
      }
      return
    }
    const ram = (f & FF_RAM) !== 0
    this.hurtFlash = Math.min(0.85, this.hurtFlash + (ram ? 0.28 : 0.3))
    this.shake.add(ram ? 0.45 : 0.3, 1)
    this.kickFrom(x, y, ram ? 12 : 8)
    this.input.rumble(120, 0.5)
    if (hp >= BIG_HIT) this.time.hitStop(HITSTOP_BIG_HIT_MS)
  }

  private onAlert(x: number, y: number, slot: number): void {
    const s = this.world.alerts.slots[slot]
    if (!s) return
    const boss = this.world.boss
    const color = s.kind === AlertKind.Boss && boss ? this.world.broodTint(boss.def.tint) : 0xff6aa8
    announce(this.world, s.title, x, y - 40, color)
  }

  /** Kick the view `px` along the line from (sx, sy) to the player. */
  private kickFrom(sx: number, sy: number, px: number): void {
    const pl = this.world.player
    const dx = pl.x - sx
    const dy = pl.y - sy
    const d = Math.hypot(dx, dy) || 1
    this.shake.kick((dx / d) * px, (dy / d) * px)
  }
}

function onScreen(x: number, y: number, v: ViewRect): boolean {
  return x > v.x - ON_SCREEN_PAD && x < v.x + v.w + ON_SCREEN_PAD && y > v.y - ON_SCREEN_PAD && y < v.y + v.h + ON_SCREEN_PAD
}
