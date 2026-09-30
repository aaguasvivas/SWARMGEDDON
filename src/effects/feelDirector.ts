import type { AudioEngine } from '../audio/audio.ts'
import { ENEMIES, type EnemyDef } from '../content/enemies.ts'
import { WEAPON_LIST } from '../content/weapons.ts'
import type { World } from '../game/world.ts'
import { haptic } from '../platform/haptics.ts'
import type { DamageNumbers } from './damageNumbers.ts'
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

const ALERT_HOLD_LONG = 3.0
const ALERT_HOLD_SHORT = 2.0

// A17 haptic pacing.
const HEAVY_HIT_HAPTIC_GAP_MS = 150
const BITE_HAPTIC_GAP_MS = 250
/** Boss kill, fusion, evolve, Hive Core and revive: heavy, then success this much later. */
const SUCCESS_FOLLOW_MS = 150
/** Drafts that get the full level-up ceremony (A2.3 fullCeremonies). */
const FULL_CEREMONIES = 3

// Section 6.5: the low-HP clock and the gem ladder.
const LOW_HP_ON = 0.25
const LOW_HP_OFF = 0.3
const HEARTBEAT_S = 0.8
const GEM_LADDER = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2, 3, 10 / 3, 4] as const
const GEM_LADDER_WINDOW_MS = 350
const KILL_LADDER_MAX_SEMIS = 12

/**
 * Turns the sim's FeelQueue into sound, haptics, shake, flashes, floating text
 * and time effects. Runs once per render frame; everything it owns is
 * presentation, so settings and frame rate can change how a run looks and
 * sounds, never how it plays.
 */
export class FeelDirector {
  /** Red hurt overlay strength, decays on the real clock. */
  hurtFlash = 0
  readonly shake = new Shake()
  readonly time = new TimeDirector()
  private biteAt = -Infinity
  private blastAt = -Infinity
  private biteHapticAt = -Infinity
  private heavyHitHapticAt = -Infinity
  /** Real-clock ms of a pending success haptic, or -1. */
  private successAt = -1
  private draftsOpened = 0
  /** Current multiplier tier (from MultUp / MultDown); drives the kill ladder. */
  private tier = 1
  private gemStep = 0
  private gemAt = -Infinity
  private lowHp = false
  /** Seconds until the next heartbeat while low HP. */
  private heartT = 0

  constructor(
    private readonly world: World,
    private readonly audio: AudioEngine,
    private readonly numbers: DamageNumbers,
  ) {}

  reset(): void {
    this.hurtFlash = 0
    this.shake.reset()
    this.time.reset()
    this.biteAt = -Infinity
    this.blastAt = -Infinity
    this.numbers.clear()
    this.biteHapticAt = -Infinity
    this.heavyHitHapticAt = -Infinity
    this.successAt = -1
    this.draftsOpened = 0
    this.tier = 1
    this.gemStep = 0
    this.gemAt = -Infinity
    this.lowHp = false
    this.heartT = 0
    this.audio.resetMix()
  }

  /** Play every event emitted since the last frame, then empty the queue.
   *  `nowMs` is the real render clock. */
  drain(nowMs: number, view: ViewRect): void {
    if (this.successAt >= 0 && nowMs >= this.successAt) {
      this.successAt = -1
      haptic('success')
    }
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
          this.audio.play(w.sfx, 0, 1, panOf(x, view))
          this.shake.kick(-Math.cos(a) * w.kickPx, -Math.sin(a) * w.kickPx)
          break
        }
        case FeelKind.Hit: {
          this.numbers.hit(x, y, a, (f & FF_CRIT) !== 0, b)
          const pan = panOf(x, view)
          this.audio.play('hit', 0, 1, pan)
          if (f & FF_CRIT) this.audio.play('crit', 0, 1, pan)
          break
        }
        case FeelKind.Kill:
          this.onKill(x, y, f, q.ref[i] as EnemyDef, view)
          break
        case FeelKind.Explosion:
          this.audio.play('heavy', 0, 1, panOf(x, view))
          if (nowMs - this.blastAt >= EXPLOSION_GAP_MS) {
            this.blastAt = nowMs
            this.shake.add(0.1, 0.35)
            this.kickFrom(x, y, 3)
          }
          break
        case FeelKind.PlayerHurt:
          this.onHurt(x, y, a, f, nowMs, view)
          break
        case FeelKind.PlayerDeath:
          this.hurtFlash = 1
          this.shake.add(0.9, 1)
          this.audio.play('death')
          this.audio.deathSweep()
          haptic('error')
          break
        case FeelKind.Revive:
          this.hurtFlash = 1
          this.shake.add(0.7, 1)
          this.audio.play('levelup')
          this.heavyThenSuccess(nowMs)
          this.time.hitStop(HITSTOP_REVIVE_MS, true)
          this.time.play(TimePreset.Revive)
          this.numbers.label('SECOND WIND', x, y, 30, 0x7dffd6)
          break
        case FeelKind.GemCollect:
          this.onGem(nowMs)
          break
        case FeelKind.HealCollect: {
          this.audio.play('heal')
          const gained = Math.round(a)
          if (gained > 0) this.numbers.heal(x, y - 24, gained)
          break
        }
        case FeelKind.WeaponPickup: {
          const w = WEAPON_LIST[b]
          this.audio.play('weapon')
          haptic('medium')
          this.shake.add(0.1, 0.35)
          if (w) this.numbers.label(w.name, x, y, 26, w.tint)
          break
        }
        case FeelKind.WeaponEmpty:
          this.audio.play('emptyClick')
          break
        case FeelKind.LowAmmo:
          this.audio.play('lowAmmo')
          break
        case FeelKind.PodSpawn:
          this.audio.play('podSpawn', 0, 1, panOf(x, view))
          break
        case FeelKind.EliteSpawn:
          this.audio.play('eliteSpawn', 0, 1, panOf(x, view))
          this.shake.add(0.2, 1)
          break
        case FeelKind.BossSpawn:
          this.audio.play('boss')
          haptic('heavy')
          this.shake.add(0.55, 1)
          this.time.play(TimePreset.BossIntro)
          break
        case FeelKind.BossPhase:
          this.audio.play('boss')
          haptic('heavy')
          this.shake.add(0.45, 1)
          break
        case FeelKind.BossKill:
          this.audio.play('bossKill')
          this.heavyThenSuccess(nowMs)
          this.shake.add(0.85, 1)
          this.time.play(TimePreset.BossKill)
          this.numbers.label(this.world.script.text.slain, x, y, 36, 0xffe066)
          break
        case FeelKind.ChargerWindup:
          this.audio.play('chargerWindup', 0, 1, panOf(x, view))
          break
        case FeelKind.EnemyShot:
          this.audio.play('spit', 0, 1, panOf(x, view))
          break
        case FeelKind.Teleport:
          this.audio.play('teleport', 0, 1, panOf(x, view))
          break
        case FeelKind.Dash:
          this.shake.kick(a * DASH_KICK_PX, b * DASH_KICK_PX)
          this.audio.play('dash')
          haptic('light')
          break
        case FeelKind.CloseCall:
          this.audio.play('closecall')
          haptic('medium')
          this.time.play(TimePreset.CloseCall)
          this.numbers.label('CLOSE CALL', x, y, 30, 0x7dffd6)
          break
        case FeelKind.Alert:
          this.onAlert(x, y, b)
          break
        case FeelKind.MultUp:
          this.tier = a
          this.audio.play('multUp', 2 * (a - 1))
          break
        case FeelKind.MultDown:
          this.tier = a
          this.audio.play('multBreak')
          break
        case FeelKind.Fusion:
          this.audio.play('fusion')
          this.heavyThenSuccess(nowMs)
          break
        case FeelKind.Evolve:
          this.audio.play('evolve')
          this.heavyThenSuccess(nowMs)
          break
        case FeelKind.CoreOpen:
          this.audio.play(a >= 5 ? 'core5' : a >= 3 ? 'core3' : 'core1')
          this.heavyThenSuccess(nowMs)
          break
        case FeelKind.Shard:
          this.audio.play('shard')
          break
        case FeelKind.Win:
          this.audio.play('win')
          haptic('success')
          break
      }
    }
    q.clear()
  }

  /** Advance real-time decays by `fd` seconds and run the low-HP clock. */
  update(fd: number, playing: boolean): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - fd * 2.2)
    const w = this.world
    const pl = w.player
    const alive = playing && !w.pendingGameOver && pl.hp > 0
    const frac = pl.hp / pl.maxHp
    if (!this.lowHp && alive && frac < LOW_HP_ON) {
      this.lowHp = true
      this.heartT = 0
      this.audio.setLowHp(true)
      haptic('warning')
    } else if (this.lowHp && (!alive || frac >= LOW_HP_OFF)) {
      this.lowHp = false
      this.audio.setLowHp(false)
    }
    if (this.lowHp && !w.paused) {
      this.heartT -= fd
      if (this.heartT <= 0) {
        this.heartT += HEARTBEAT_S
        this.audio.play('heartbeat')
      }
    }
  }

  /** A level-up draft opened: the full ceremony for a run's first drafts,
   *  the short one after. */
  draftOpened(): void {
    this.draftsOpened++
    this.audio.play('levelup')
    haptic(this.draftsOpened <= FULL_CEREMONIES ? 'success' : 'light')
  }

  cardPicked(): void {
    haptic('medium')
  }

  /** The recap is showing: celebrate a new best and fresh unlocks. */
  runEnded(newBest: boolean, unlocked: boolean): void {
    if (newBest) this.audio.play('newBest')
    else if (unlocked) this.audio.play('feat')
    if (newBest || unlocked) haptic('success')
  }

  private heavyThenSuccess(nowMs: number): void {
    haptic('heavy')
    this.successAt = nowMs + SUCCESS_FOLLOW_MS
  }

  private onGem(nowMs: number): void {
    const step = nowMs - this.gemAt <= GEM_LADDER_WINDOW_MS ? Math.min(this.gemStep + 1, GEM_LADDER.length - 1) : 0
    this.gemAt = nowMs
    if (this.audio.play('gem', 0, GEM_LADDER[step])) this.gemStep = step
  }

  private onKill(x: number, y: number, f: number, def: EnemyDef, view: ViewRect): void {
    this.audio.play('kill', Math.min(KILL_LADDER_MAX_SEMIS, 2 * (this.tier - 1)), 1, panOf(x, view))
    if (f & FF_BOSS) return
    const on = onScreen(x, y, view)
    if (f & FF_ELITE) {
      if (on) {
        this.shake.add(0.4, 1)
        this.time.hitStop(HITSTOP_ELITE_MS)
        haptic('medium')
      } else {
        this.shake.add(0.05, 0.35)
      }
    } else if (def.xp <= 1) {
      this.shake.add(0.015, 0.25)
    } else if (on) {
      this.shake.add(0.04, 0.35)
    }
  }

  private onHurt(x: number, y: number, hp: number, f: number, nowMs: number, view: ViewRect): void {
    if (f & FF_ACID) {
      this.hurtFlash = Math.min(0.6, this.hurtFlash + hp * 0.04)
      this.shake.add(0.008, 0.25)
      return
    }
    if (f & FF_CONTACT) {
      this.hurtFlash = Math.min(0.7, this.hurtFlash + hp * 0.05)
      this.audio.play('graze', 0, 1, panOf(x, view))
      if (nowMs - this.biteHapticAt >= BITE_HAPTIC_GAP_MS) {
        this.biteHapticAt = nowMs
        haptic('light')
      }
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
    this.audio.play('hurt', 0, 1, panOf(x, view))
    if (hp < BIG_HIT) haptic('medium')
    else if (nowMs - this.heavyHitHapticAt >= HEAVY_HIT_HAPTIC_GAP_MS) {
      this.heavyHitHapticAt = nowMs
      haptic('heavy')
    }
    if (hp >= BIG_HIT) this.time.hitStop(HITSTOP_BIG_HIT_MS)
  }

  private onAlert(x: number, y: number, slot: number): void {
    const s = this.world.alerts.slots[slot]
    if (!s) return
    switch (s.kind as AlertKind) {
      case AlertKind.Boss:
        this.audio.play('alertBoss')
        break
      case AlertKind.Final:
        this.audio.play('alertBoss')
        haptic('warning')
        break
      case AlertKind.Event:
        this.audio.play('alertEvent')
        haptic('warning')
        break
      case AlertKind.Elite:
        this.audio.play('alertElite')
        break
    }
    const bossy = s.kind === AlertKind.Boss || s.kind === AlertKind.Final
    const color = bossy ? this.world.broodTint(ENEMIES[this.world.script.boss.midId]!.tint) : 0xff6aa8
    // A15 holds: boss, final and event alerts last until the beat lands.
    const life = bossy || s.kind === AlertKind.Event ? ALERT_HOLD_LONG : ALERT_HOLD_SHORT
    this.numbers.label(s.title, x, y, 52, color, life)
    if (s.sub) this.numbers.label(s.sub, x, y, 30, color, life)
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

/** Stereo position of a world x across the view: -1 left edge, 1 right edge. */
function panOf(x: number, v: ViewRect): number {
  const half = v.w / 2
  if (half <= 0) return 0
  const p = (x - v.x - half) / half
  return p < -1 ? -1 : p > 1 ? 1 : p
}
