import { Container, type Sprite } from 'pixi.js'
import type { AudioEngine } from '../audio/audio.ts'
import { TIER_COLOR } from '../config.ts'
import { type EnemyDef } from '../content/enemies.ts'
import { FUSIONS, PERKS } from '../content/perks.ts'
import { WEAPONS, WEAPON_LIST } from '../content/weapons.ts'
import { CLOSE_CALL_CHAIN } from '../core/rules.ts'
import type { World } from '../game/world.ts'
import { haptic } from '../platform/haptics.ts'
import { CALLOUT, CALLOUT_COLOR, type Callouts } from '../ui/callouts.ts'
import type { Hud } from '../ui/hud.ts'
import type { OffscreenArrows } from '../ui/offscreenArrows.ts'
import { T } from '../ui/tokens.ts'
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

/** A boss telegraph sounds the charger windup shifted per boss, so each
 *  boss has its own cue: the Queen a fifth down, the Matron a tone down, the
 *  Tyrant an octave down. */
const TELE_SEMIS_QUEEN = -7
const TELE_SEMIS_MATRON = -2
const TELE_SEMIS_TYRANT = -12
/** A16.3: a hazard detonation this close to the player shakes the view. */
const HAZARD_NEAR = 400
/** A hit the LIVING ARMOR overshield takes whole: the SHIELD chime this many
 *  semitones up and a small kick, with no red flash. */
const SHIELD_HIT_SEMIS = 7
const SHIELD_HIT_KICK_PX = 3
/** A3: the cyan ring a whole-hit absorb draws on the ship. */
const SHIELD_RING = 0x57e0ff

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

/** A14 tier names (index = tier); x1 and x2 are not announced. */
const TIER_NAME = ['', '', '', 'RAMPAGE', 'CARNAGE', 'MAYHEM', 'HAVOC', 'EXTINCTION', 'SWARMGEDDON'] as const
/** A15: a tier is announced at most once per this many ms. */
const MULT_UP_GAP_MS = 6000
const MULT_UP_MIN_TIER = 3
/** Section 6.5 hurt: the red edge flash per discrete hit and per ram, and its cap. */
const HURT_DISCRETE = 0.3
const HURT_RAM = 0.28
const HURT_CAP = 0.6
const HURT_DECAY = 2.2
/** The directional edge glow toward a hit's source, and the ship's red tint flash. */
const EDGE_DISCRETE = 0.9
const EDGE_BITE = 0.45
const EDGE_DECAY = 2.5
const SHIP_FLASH_S = 0.12
/** The heartbeat's two thumps (the SFX's second lands 0.14 s after the first). */
const THUMP2_S = 0.14
const THUMP_DECAY = 10

/**
 * Turns the sim's FeelQueue into sound, haptics, shake, flashes, floating text
 * and time effects. Runs once per render frame; everything it owns is
 * presentation, so settings and frame rate can change how a run looks and
 * sounds, never how it plays.
 */
export class FeelDirector {
  /** Red hurt overlay strength, decays on the real clock. */
  hurtFlash = 0
  /** Edge glow toward the last hit's source (strength and unit direction). */
  edge = 0
  edgeX = 0
  edgeY = 1
  /** Seconds of red tint left on the ship. */
  shipFlash = 0
  /** Low HP and its heartbeat envelope (0..1), which drives the HP bar and the red vignette. */
  lowHp = false
  pulse = 0
  readonly shake = new Shake()
  readonly time = new TimeDirector()
  /** World-space cues on the ship (the LIVING ARMOR ring). */
  readonly shipFx = new ShipRings()
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
  /** Seconds until the next heartbeat while low HP, and since the last one. */
  private heartT = 0
  private beatAge = 9
  /** Real-clock ms each tier was last announced. */
  private readonly multUpAt = new Float64Array(TIER_COLOR.length)
  /** The world's best score when the run began (0 = none) and whether NEW BEST showed. */
  private bestScore = 0
  private newBestShown = false
  /** killPts and bossesFlawless when the current boss arrived. */
  private bossPtsAt = 0
  private flawlessAt = 0

  constructor(
    private readonly world: World,
    private readonly audio: AudioEngine,
    private readonly numbers: DamageNumbers,
    private readonly callouts: Callouts,
    private readonly arrows: OffscreenArrows,
    private readonly hud: Hud,
  ) {
    this.shipFx.build(world)
  }

  /** Fresh run (or the menu). `bestScore` is the world's best so far (0 = none). */
  reset(bestScore = 0): void {
    this.hurtFlash = 0
    this.edge = 0
    this.shipFlash = 0
    this.shake.reset()
    this.time.reset()
    this.biteAt = -Infinity
    this.blastAt = -Infinity
    this.numbers.clear()
    this.callouts.clear()
    this.arrows.clear()
    this.shipFx.clear()
    this.biteHapticAt = -Infinity
    this.heavyHitHapticAt = -Infinity
    this.successAt = -1
    this.draftsOpened = 0
    this.tier = 1
    this.gemStep = 0
    this.gemAt = -Infinity
    this.lowHp = false
    this.pulse = 0
    this.heartT = 0
    this.beatAge = 9
    this.multUpAt.fill(-Infinity)
    this.bestScore = bestScore
    this.newBestShown = false
    this.bossPtsAt = 0
    this.flawlessAt = 0
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
    // A hit halves the chain (ChainHit), then the tier drop follows in this drain.
    let hitDrop = false
    // The PRIME's kill: Win comes first in the queue and announces the kill with the win.
    let won = false
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
        case FeelKind.ShieldHit:
          this.onShieldHit(x, y, f, nowMs, view)
          break
        case FeelKind.PlayerDeath:
          this.hurtFlash = 1
          this.shake.add(0.9, 1)
          this.audio.play('death')
          this.audio.deathSweep()
          haptic('error')
          break
        case FeelKind.Revive:
          this.hurtFlash = HURT_CAP
          this.shake.add(0.7, 1)
          this.audio.play('levelup')
          this.heavyThenSuccess(nowMs)
          this.time.hitStop(HITSTOP_REVIVE_MS, true)
          this.time.play(TimePreset.Revive)
          this.callouts.show(CALLOUT.revive, 'SECOND WIND', '', CALLOUT_COLOR.revive)
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
          if (w && this.world.ammoMax > 0) {
            const sec = Math.round(this.world.ammoMax / w.fireRate)
            this.callouts.show(CALLOUT.weaponPickup, w.name.toUpperCase(), sec + ' SECONDS OF AMMO', w.tint)
          }
          break
        }
        case FeelKind.WeaponEmpty: {
          this.audio.play('emptyClick')
          const base = WEAPONS[this.world.baseWeaponId]
          if (base) this.callouts.show(CALLOUT.outOfAmmo, 'OUT OF AMMO', 'Back to ' + base.name.toUpperCase(), T.accentDanger)
          break
        }
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
          this.bossPtsAt = this.world.killPts
          this.flawlessAt = this.world.bossesFlawless
          break
        case FeelKind.BossPhase:
          this.audio.play('boss')
          haptic('heavy')
          this.shake.add(0.45, 1)
          this.callouts.show(CALLOUT.bossPhase, this.world.director.bossTitle + ' ENRAGES', '', CALLOUT_COLOR.boss)
          break
        case FeelKind.BossTele:
          this.audio.play('chargerWindup', teleSemis(q.ref[i] as EnemyDef | null), 1, panOf(x, view))
          break
        case FeelKind.BossFrenzy:
          this.audio.play('alertEvent')
          this.callouts.show(CALLOUT.frenzy, 'FRENZY', 'FINISH IT', T.accentDanger)
          break
        case FeelKind.HazardDetonate: {
          const pl = this.world.player
          if ((pl.x - x) ** 2 + (pl.y - y) ** 2 < HAZARD_NEAR * HAZARD_NEAR) this.shake.add(0.15, 0.5)
          break
        }
        case FeelKind.BossKill:
          this.audio.play('bossKill')
          this.heavyThenSuccess(nowMs)
          this.shake.add(0.85, 1)
          this.time.play(TimePreset.BossKill)
          if (!won) this.bossSlain()
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
          this.callouts.show(CALLOUT.closeCall, 'CLOSE CALL', '+' + CLOSE_CALL_CHAIN + ' CHAIN', CALLOUT_COLOR.mint)
          break
        case FeelKind.Alert:
          this.onAlert(b)
          break
        case FeelKind.MultUp:
          this.tier = a
          this.audio.play('multUp', 2 * (a - 1))
          if (a >= MULT_UP_MIN_TIER && nowMs - this.multUpAt[a]! >= MULT_UP_GAP_MS) {
            this.multUpAt[a] = nowMs
            this.callouts.show(CALLOUT.multUp, TIER_NAME[a] ?? '', 'x' + a, TIER_COLOR[a]!)
          }
          break
        case FeelKind.ChainHit:
          hitDrop = true
          break
        case FeelKind.MultDown:
          if (hitDrop) this.hud.tierDrop(this.tier, a)
          hitDrop = false
          this.tier = a
          this.audio.play('multBreak')
          break
        case FeelKind.Fusion: {
          this.audio.play('fusion')
          this.heavyThenSuccess(nowMs)
          const f = FUSIONS[b]
          if (f) this.callouts.show(CALLOUT.fusion, f.name, perkName(f.a) + ' + ' + perkName(f.b), CALLOUT_COLOR.fusion)
          break
        }
        case FeelKind.Evolve: {
          this.audio.play('evolve')
          this.heavyThenSuccess(nowMs)
          const w = WEAPON_LIST[b]
          if (w) this.callouts.show(CALLOUT.evolve, w.name.toUpperCase(), 'EVOLVED', CALLOUT_COLOR.evolve)
          break
        }
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
          this.shake.add(0.6, 1)
          won = true
          this.bossSlain()
          this.callouts.show(CALLOUT.win, this.world.script.text.win, 'CLEARED IN ' + clock(this.world.director.clearTime), T.accentGold)
          break
        case FeelKind.Stalemate:
          this.audio.play('multBreak')
          this.callouts.show(CALLOUT.stalemate, this.world.script.text.stalemate, '', T.accentDanger)
          break
      }
    }
    q.clear()
  }

  /** Advance real-time decays by `fd` seconds and run the low-HP clock. */
  update(fd: number, playing: boolean): void {
    this.hurtFlash = Math.max(0, this.hurtFlash - fd * HURT_DECAY)
    this.edge = Math.max(0, this.edge - fd * EDGE_DECAY)
    this.shipFlash = Math.max(0, this.shipFlash - fd)
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
      this.beatAge += fd
      if (this.heartT <= 0) {
        this.heartT += HEARTBEAT_S
        this.beatAge = 0
        this.audio.play('heartbeat')
      }
    }
    const b = this.beatAge
    this.pulse = this.lowHp ? Math.min(1, Math.exp(-b * THUMP_DECAY) + (b >= THUMP2_S ? 0.6 * Math.exp(-(b - THUMP2_S) * THUMP_DECAY) : 0)) : 0
    if (playing && !this.newBestShown && this.bestScore > 0 && w.score > this.bestScore) {
      this.newBestShown = true
      this.callouts.show(CALLOUT.newBest, 'NEW BEST', group(w.score), T.accentGold)
    }
    this.shipFx.update(w, fd)
  }

  /** The run's opening line: the world, or the Daily. */
  intro(title: string, sub: string, color: number, daily: boolean): void {
    this.callouts.show(daily ? CALLOUT.dailyIntro : CALLOUT.worldIntro, title, sub, color)
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
      this.hurtFlash = Math.min(HURT_CAP, this.hurtFlash + hp * 0.04)
      this.shake.add(0.008, 0.25)
      return
    }
    if (f & FF_CONTACT) {
      this.hurtFlash = Math.min(HURT_CAP, this.hurtFlash + hp * 0.05)
      this.edgeToward(x, y, EDGE_BITE)
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
    this.hurtFlash = Math.min(HURT_CAP, this.hurtFlash + (ram ? HURT_RAM : HURT_DISCRETE))
    this.edgeToward(x, y, EDGE_DISCRETE)
    this.shipFlash = SHIP_FLASH_S
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

  /** Point the edge glow from the ship toward (sx, sy). */
  private edgeToward(sx: number, sy: number, strength: number): void {
    const pl = this.world.player
    const dx = sx - pl.x
    const dy = sy - pl.y
    const d = Math.hypot(dx, dy)
    if (d < 1e-3) return
    this.edgeX = dx / d
    this.edgeY = dy / d
    this.edge = Math.max(this.edge, strength)
  }

  /** A boss died: its slain line, the points of its fight, and FLAWLESS when no hit landed. */
  private bossSlain(): void {
    const w = this.world
    const pts = w.killPts - this.bossPtsAt
    this.callouts.show(CALLOUT.bossSlain, w.script.text.slain, pts > 0 ? '+' + group(pts) : '', T.accentGold)
    if (w.bossesFlawless > this.flawlessAt) {
      this.flawlessAt = w.bossesFlawless
      this.callouts.show(CALLOUT.flawless, 'FLAWLESS', '', CALLOUT_COLOR.mint)
    }
  }

  private onShieldHit(x: number, y: number, f: number, nowMs: number, view: ViewRect): void {
    if (f & FF_ACID) return
    if (f & FF_CONTACT) {
      if (nowMs - this.biteAt < BITE_GAP_MS) return
      this.biteAt = nowMs
    }
    this.audio.play('bonus_shield', SHIELD_HIT_SEMIS, 1, panOf(x, view))
    this.kickFrom(x, y, SHIELD_HIT_KICK_PX)
    this.shipFx.ring(SHIELD_RING)
    haptic('light')
  }

  private onAlert(slot: number): void {
    const s = this.world.alerts.slots[slot]
    if (!s) return
    switch (s.kind as AlertKind) {
      case AlertKind.Boss:
      case AlertKind.Final:
        this.audio.play('alertBoss')
        if (s.kind === AlertKind.Final) haptic('warning')
        this.callouts.show(CALLOUT.alertBoss, s.title, s.sub, CALLOUT_COLOR.boss)
        this.arrows.alert(s.dirX, s.dirY, CALLOUT_COLOR.boss)
        break
      case AlertKind.Event:
        this.audio.play('alertEvent')
        haptic('warning')
        this.callouts.show(CALLOUT.alertEvent, s.title, s.sub, CALLOUT_COLOR.event)
        this.arrows.alert(s.dirX, s.dirY, CALLOUT_COLOR.event)
        break
      case AlertKind.Elite:
        this.audio.play('alertElite')
        this.callouts.show(CALLOUT.alertElite, s.title, s.sub, T.accentGold)
        this.arrows.alert(s.dirX, s.dirY, T.accentGold)
        break
      default:
        this.callouts.show(CALLOUT.alertLull, s.title, s.sub, T.textPrimary)
    }
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

function teleSemis(def: EnemyDef | null): number {
  const id = def ? def.id : ''
  return id.startsWith('voidMatron') ? TELE_SEMIS_MATRON : id.startsWith('emberTyrant') ? TELE_SEMIS_TYRANT : TELE_SEMIS_QUEEN
}

function perkName(id: string): string {
  for (let i = 0; i < PERKS.length; i++) if (PERKS[i]!.id === id) return PERKS[i]!.name.toUpperCase()
  return id.toUpperCase()
}

/** 48210 -> '48,210' (event rate only). */
function group(v: number): string {
  const s = String(Math.floor(v))
  let out = ''
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ','
    out += s[i]
  }
  return out
}

/** Seconds as m:ss. */
function clock(sec: number): string {
  const s = Math.floor(sec)
  const r = s % 60
  return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r
}

const RING_SLOTS = 3
const RING_S = 0.3
const RING_TEX_R = 28

/** Rings that expand from the ship (a whole hit absorbed by the overshield).
 *  World space, in the unbloomed overlay; pooled. */
export class ShipRings {
  readonly view = new Container()
  private readonly sprites: Sprite[] = []
  private readonly age = new Float32Array(RING_SLOTS)

  build(world: World): void {
    for (let i = 0; i < RING_SLOTS; i++) {
      const s = world.texReg.makeSprite('ring')
      this.sprites.push(s)
      this.view.addChild(s)
      this.age[i] = RING_S
    }
  }

  ring(tint: number): void {
    let slot = 0
    for (let i = 0; i < RING_SLOTS; i++) if (this.age[i]! > this.age[slot]!) slot = i
    this.age[slot] = 0
    const s = this.sprites[slot]!
    s.tint = tint
    s.visible = true
  }

  clear(): void {
    for (let i = 0; i < RING_SLOTS; i++) {
      this.age[i] = RING_S
      if (this.sprites[i]) this.sprites[i]!.visible = false
    }
  }

  update(world: World, fd: number): void {
    const pv = world.player.view
    for (let i = 0; i < RING_SLOTS; i++) {
      const s = this.sprites[i]!
      if (!s.visible) continue
      const a = (this.age[i] = this.age[i]! + fd)
      if (a >= RING_S) {
        s.visible = false
        continue
      }
      const k = a / RING_S
      s.position.set(pv.x, pv.y)
      s.scale.set(((world.player.radius + 6) * (1 + 0.8 * k)) / RING_TEX_R)
      s.alpha = 1 - k
    }
  }
}
