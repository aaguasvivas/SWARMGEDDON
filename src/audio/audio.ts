/**
 * Procedural audio, fully synthesized via the Web Audio API. No sample files,
 * so there's nothing to download (instant load) and the whole soundscape is
 * data-light. Layered SFX per event + an adaptive music bed whose intensity
 * tracks the on-screen chaos.
 *
 * Every sound has a priority tier (A16.1). Tier 0 is chaff (shots, hits, kills,
 * gems) and plays on its own bus, which bigger sounds duck so a boss cue is
 * never buried under a 200-kill wipe. At most VOICE_CAP recipes sound at once.
 *
 * Mobile browsers block audio until a user gesture; `attachUnlock()` resumes the
 * context (and starts music) on the first tap/key. Everything no-ops until then.
 */
const TIER0 = ['pistol', 'smg', 'plasma', 'beam', 'whoosh', 'hit', 'kill', 'gem', 'graze', 'spit', 'teleport', 'crit', 'tick'] as const
const TIER1 = [
  'shotgun', 'heavy', 'crack', 'weapon', 'hurt', 'heal', 'eliteSpawn', 'chargerWindup', 'podSpawn', 'emptyClick', 'lowAmmo',
  'heartbeat', 'ui', 'uiConfirm', 'uiBack', 'cardDeal', 'countdown', 'stamp', 'dash', 'closecall', 'shard', 'bonus_nuke',
  'bonus_freeze', 'bonus_overdrive', 'bonus_fireblast', 'bonus_shield', 'bonus_vacuum', 'multUp', 'multBreak', 'alertEvent',
  'alertElite',
] as const
const TIER2 = [
  'boss', 'bossKill', 'death', 'levelup', 'fusion', 'evolve', 'core1', 'core3', 'core5', 'newBest', 'feat', 'win', 'alertBoss',
] as const

export type SfxName = (typeof TIER0)[number] | (typeof TIER1)[number] | (typeof TIER2)[number]

const TIER = {} as Record<SfxName, number>
for (const n of TIER0) TIER[n] = 0
for (const n of TIER1) TIER[n] = 1
for (const n of TIER2) TIER[n] = 2

/** Minimum seconds between two starts of the same sound (A16.2). */
const THROTTLE: Partial<Record<SfxName, number>> = {
  hit: 0.03, kill: 0.04, gem: 0.06, hurt: 0.09, graze: 0.25, eliteSpawn: 0.4, alertEvent: 1, alertElite: 1, alertBoss: 1,
  chargerWindup: 0.15, spit: 0.12, teleport: 0.2, emptyClick: 0.3, heal: 0.08, crit: 0.05, whoosh: 0.045, tick: 0.045,
  uiConfirm: 0.06, uiBack: 0.06, dash: 0.15, closecall: 0.2, multUp: 0.25, multBreak: 0.3, shard: 0.2,
}

export const VOICE_CAP = 24
/** Source nodes one recipe can start (the largest, `win`, starts 15). */
const MAX_SOURCES = 20
const PAN_STOPS = [-1, -0.5, 0, 0.5, 1] as const
const STEAL_FADE_S = 0.008

const CHAFF_DUCK_T1 = 0.4
const CHAFF_HOLD_T1 = 0.04
const CHAFF_DUCK_T2 = 0
const CHAFF_HOLD_T2 = 0.12
const MUSIC_DUCK = 0.5
const MUSIC_DUCK_RELEASE = 0.4
const MUSIC_DUCK_BIG = 0.35
const MUSIC_DUCK_BIG_RELEASE = 0.9
const MUSIC_DUCK_ATTACK = 0.015
const PAUSE_DUCK = 0.6
const LP_IDLE = 20000
const LP_PAUSE = 600
const LP_LOW_HP = 900
const LP_DEATH = 400
const LP_DEATH_SWEEP_S = 0.6
const LP_GLIDE_TC = 0.08

// Recipe note tables, hoisted so a play allocates only its audio nodes.
const LEVELUP_A = [523, 659, 784, 1047, 1319]
const LEVELUP_B = [1047, 1319, 1568, 2093, 2637]
const LEVELUP_C = [1047, 1319, 1568]
const WEAPON_RACK = [196, 392, 587, 784]
const BOSS_STAB = [110, 116.5, 146.8]
const BOSS_KILL_A = [392, 494, 587, 784, 988]
const BOSS_KILL_B = [784, 988, 1175, 1568]
const WIN_TAIL = [523, 659, 784, 1047]
const MULT_UP = [659, 880]
const FUSION = [523, 659, 784, 1047, 1319]
const EVOLVE = [392, 523, 659, 784, 1047, 1319]
const CORE1 = [784, 988]
const CORE3 = [784, 988, 1175]
const CORE5 = [784, 988, 1175, 1568]
const BONUS_RUSH = [330, 440, 554, 659]
const FANFARE = [659, 784, 988, 1319]

/** Per-world music identity: pure data over the same look-ahead scheduler. */
export interface MusicTheme {
  bassNotes: readonly number[]
  arpNotes: readonly number[]
  bassWave: OscillatorType
  arpWave: OscillatorType
  bpmBase: number
  bpmRange: number
  bassCutoffBase: number
  bassCutoffRange: number
  arpCutoffBase: number
  arpCutoffRange: number
}

/** The classic hive bed (also the menu theme). */
export const DEFAULT_MUSIC_THEME: MusicTheme = {
  bassNotes: [110, 110, 146.83, 110, 130.81, 110, 146.83, 123.47], // A Phrygian-ish
  arpNotes: [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63],
  bassWave: 'sawtooth',
  arpWave: 'triangle',
  bpmBase: 96,
  bpmRange: 48,
  bassCutoffBase: 300,
  bassCutoffRange: 400,
  arpCutoffBase: 1200,
  arpCutoffRange: 2000,
}

/** One sounding recipe: its output gain and the sources it started, so a
 *  higher-tier sound can cut it off when every slot is taken. */
class Voice {
  tier = 0
  start = 0
  end = 0
  out: GainNode | null = null
  readonly src: (AudioScheduledSourceNode | null)[] = new Array<AudioScheduledSourceNode | null>(MAX_SOURCES).fill(null)
  n = 0
}

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private chaffBus: GainNode | null = null
  private readonly chaffPan: AudioNode[] = []
  private readonly mainPan: AudioNode[] = []
  private musicBus: GainNode | null = null
  private musicDuck: GainNode | null = null
  private musicLP: BiquadFilterNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private unlocked = false
  private musicStep = 0
  private nextNoteTime = 0
  /** 0..1, set by the game to scale music density/brightness. */
  intensity = 0

  private vol = { master: 0.8, sfx: 0.9, music: 0.55 }
  private theme: MusicTheme = DEFAULT_MUSIC_THEME

  private readonly voices: Voice[] = []
  /** The voice the running recipe writes into. */
  private cur: Voice | null = null
  /** Frequency multiplier of the running recipe (semitones and ratio). */
  private pitch = 1
  /** Audio-clock time each sound last started (throttles, and the probes). */
  private readonly lastAt = {} as Record<SfxName, number>
  private chaffLevel = 1
  private chaffUntil = 0
  private paused = false
  private lowHp = false
  private dying = false
  /** Voice accounting since boot: peak concurrent recipes, drops at the cap,
   *  and voices cut off by a higher tier. */
  readonly stats = { peak: 0, dropped: 0, stolen: 0 }

  constructor() {
    for (let i = 0; i < VOICE_CAP; i++) this.voices.push(new Voice())
    for (const n of TIER0) this.lastAt[n] = -1e9
    for (const n of TIER1) this.lastAt[n] = -1e9
    for (const n of TIER2) this.lastAt[n] = -1e9
  }

  /** Swap the music identity (per-world; render-side only, never touches the sim). */
  setTheme(theme: MusicTheme): void {
    this.theme = theme
  }

  setVolumes(master: number, sfx: number, music: number): void {
    this.vol = { master, sfx, music }
    if (this.master) this.master.gain.value = master
    if (this.sfxBus) this.sfxBus.gain.value = sfx
    if (this.musicBus) this.musicBus.gain.value = music
  }

  /** Wire one-time gesture listeners that create + resume the audio context,
   *  and suspend the context while the page is hidden. */
  attachUnlock(): void {
    const unlock = () => {
      this.ensureContext()
      this.ctx?.resume()
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
      window.removeEventListener('touchstart', unlock)
    }
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchstart', unlock)
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx
      if (!ctx) return
      if (document.hidden) void ctx.suspend().catch(() => {})
      else void ctx.resume().catch(() => {})
    })
  }

  private ensureContext(): void {
    if (this.ctx) return
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return
    const ctx = new Ctor()
    const master = ctx.createGain()
    master.gain.value = this.vol.master
    master.connect(ctx.destination)
    // SFX route through a gentle tanh saturator: layered hits sum hot, the
    // shaper rounds the peaks into punch instead of clipping, and every effect
    // gains a little analog glue. Music bypasses it and stays clean.
    const shaper = ctx.createWaveShaper()
    const curve = new Float32Array(257)
    for (let i = 0; i <= 256; i++) {
      const x = (i / 128 - 1) * 2.2
      curve[i] = Math.tanh(x) / Math.tanh(2.2)
    }
    shaper.curve = curve
    shaper.connect(master)
    const sfxBus = ctx.createGain()
    sfxBus.gain.value = this.vol.sfx
    sfxBus.connect(shaper)
    // Pan sits before the tier gain (gain and pan commute), so one param per
    // tier bus carries every duck.
    const chaffBus = ctx.createGain()
    chaffBus.connect(sfxBus)
    const mainBus = ctx.createGain()
    mainBus.connect(sfxBus)
    for (const p of PAN_STOPS) {
      this.chaffPan.push(makePan(ctx, p, chaffBus))
      this.mainPan.push(makePan(ctx, p, mainBus))
    }
    const musicLP = ctx.createBiquadFilter()
    musicLP.type = 'lowpass'
    musicLP.frequency.value = LP_IDLE
    musicLP.connect(master)
    const musicDuck = ctx.createGain()
    musicDuck.connect(musicLP)
    const musicBus = ctx.createGain()
    musicBus.gain.value = this.vol.music
    musicBus.connect(musicDuck)
    // One shared noise bed reused by every burst (random start offset), instead
    // of allocating a fresh AudioBuffer per shot (GC churn in heavy combat).
    // Two seconds covers the longest burst (1.0 s) with room to vary the offset.
    const frames = ctx.sampleRate * 2
    const noiseBuf = ctx.createBuffer(1, frames, ctx.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < frames; i++) nd[i] = Math.random() * 2 - 1
    this.noiseBuf = noiseBuf
    this.ctx = ctx
    this.master = master
    this.sfxBus = sfxBus
    this.chaffBus = chaffBus
    this.musicBus = musicBus
    this.musicDuck = musicDuck
    this.musicLP = musicLP
    this.unlocked = true
    this.nextNoteTime = ctx.currentTime
  }

  // --- Mix states (A16.1) -----------------------------------------------------

  /** Pause sheet open: music lowpass 600 Hz and a 0.6 duck. */
  setPaused(on: boolean): void {
    if (this.paused === on) return
    this.paused = on
    this.applyLowpass()
    this.applyDuckBase()
  }

  /** Low-HP state: music lowpass 900 Hz. */
  setLowHp(on: boolean): void {
    if (this.lowHp === on) return
    this.lowHp = on
    this.applyLowpass()
  }

  /** Death: sweep the music lowpass down to 400 Hz. Holds until `resetMix`. */
  deathSweep(): void {
    this.dying = true
    const lp = this.musicLP
    const ctx = this.ctx
    if (!lp || !ctx) return
    const t = ctx.currentTime
    lp.frequency.cancelScheduledValues(t)
    lp.frequency.setValueAtTime(lp.frequency.value, t)
    lp.frequency.exponentialRampToValueAtTime(LP_DEATH, t + LP_DEATH_SWEEP_S)
  }

  /** Back to the idle mix (run start, menu). */
  resetMix(): void {
    this.paused = false
    this.lowHp = false
    this.dying = false
    this.applyLowpass()
    this.applyDuckBase()
  }

  private applyLowpass(): void {
    const ctx = this.ctx
    if (!ctx || !this.musicLP || this.dying) return
    const t = ctx.currentTime
    const f = this.musicLP.frequency
    f.cancelScheduledValues(t)
    f.setTargetAtTime(this.paused ? LP_PAUSE : this.lowHp ? LP_LOW_HP : LP_IDLE, t, LP_GLIDE_TC)
  }

  private applyDuckBase(): void {
    const ctx = this.ctx
    if (!ctx || !this.musicDuck) return
    const t = ctx.currentTime
    const g = this.musicDuck.gain
    g.cancelScheduledValues(t)
    g.setTargetAtTime(this.duckBase(), t, LP_GLIDE_TC)
  }

  private duckBase(): number {
    return this.paused ? PAUSE_DUCK : 1
  }

  // --- SFX -------------------------------------------------------------------

  /** Voices sounding right now. */
  activeVoices(): number {
    const ctx = this.ctx
    if (!ctx) return 0
    const now = ctx.currentTime
    let n = 0
    for (const v of this.voices) if (v.end > now) n++
    return n
  }

  /**
   * Start a sound. `semis` and `ratio` scale every oscillator of the recipe
   * (kill and gem ladders, card deal, countdown); `pan` is -1 (left) to 1
   * (right) and snaps to the nearest pan bus. Returns whether it started.
   */
  play(name: SfxName, semis = 0, ratio = 1, pan = 0): boolean {
    const ctx = this.ctx
    if (!this.unlocked || !ctx) return false
    // While suspended/interrupted (iOS call banner, Siri, audio-focus loss) the
    // audio clock FREEZES: every node scheduled here would stack on one frozen
    // timestamp and all detonate together when updateMusic() resumes the
    // context. Drop SFX until it's running again (updateMusic self-heals it).
    if (ctx.state !== 'running') return false
    const now = ctx.currentTime
    const gap = THROTTLE[name]
    if (gap !== undefined && now - this.lastAt[name] < gap) return false
    const tier = TIER[name]
    const v = this.claimVoice(tier, now)
    if (!v) {
      this.stats.dropped++
      return false
    }
    this.lastAt[name] = now
    const out = ctx.createGain()
    let bus = Math.round((pan + 1) * 2)
    bus = bus < 0 ? 0 : bus > 4 ? 4 : bus
    out.connect((tier === 0 ? this.chaffPan : this.mainPan)[bus]!)
    v.tier = tier
    v.start = now
    v.end = now
    v.out = out
    v.n = 0
    this.cur = v
    this.pitch = semis === 0 ? ratio : ratio * Math.pow(2, semis / 12)
    this.recipe(name)
    this.cur = null
    const live = this.activeVoices()
    if (live > this.stats.peak) this.stats.peak = live
    if (tier === 1) this.duckChaff(CHAFF_DUCK_T1, CHAFF_HOLD_T1, now)
    else if (tier === 2) {
      this.duckChaff(CHAFF_DUCK_T2, CHAFF_HOLD_T2, now)
      const big = name === 'bossKill' || name === 'death' || name === 'win'
      this.duckMusic(big ? MUSIC_DUCK_BIG : MUSIC_DUCK, big ? MUSIC_DUCK_BIG_RELEASE : MUSIC_DUCK_RELEASE, now)
    }
    return true
  }

  /** A free slot, or the oldest voice of a lower tier cut off to make room.
   *  Null means the sound is dropped. */
  private claimVoice(tier: number, now: number): Voice | null {
    let free: Voice | null = null
    let victim: Voice | null = null
    for (const v of this.voices) {
      if (v.end <= now) {
        if (v.out) this.release(v)
        if (!free) free = v
        continue
      }
      if (v.tier < tier && (!victim || v.tier < victim.tier || (v.tier === victim.tier && v.start < victim.start))) victim = v
    }
    if (free) return free
    if (!victim) return null
    // Fade the old output instead of disconnecting it, so the cut never clicks.
    const out = victim.out!
    out.gain.cancelScheduledValues(now)
    out.gain.setValueAtTime(out.gain.value, now)
    out.gain.linearRampToValueAtTime(0, now + STEAL_FADE_S)
    for (let i = 0; i < victim.n; i++) {
      try {
        victim.src[i]!.stop(now + STEAL_FADE_S)
      } catch {
        // already stopped
      }
    }
    victim.out = null
    this.release(victim)
    this.stats.stolen++
    return victim
  }

  private release(v: Voice): void {
    v.out?.disconnect()
    v.out = null
    for (let i = 0; i < v.n; i++) v.src[i] = null
    v.n = 0
    v.end = 0
  }

  /** Register a started source with the running recipe's voice. */
  private track(src: AudioScheduledSourceNode, stopAt: number): void {
    const v = this.cur!
    if (v.n < MAX_SOURCES) v.src[v.n++] = src
    if (stopAt > v.end) v.end = stopAt
  }

  /** Dip the chaff bus to `level` for `hold` s. A shallower duck never
   *  shortens a deeper one that is still holding. */
  private duckChaff(level: number, hold: number, now: number): void {
    const bus = this.chaffBus
    if (!bus) return
    if (now < this.chaffUntil && level > this.chaffLevel) return
    const g = bus.gain
    const until = Math.max(now + hold, level === this.chaffLevel ? this.chaffUntil : 0)
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(level, now + 0.005)
    g.setValueAtTime(level, until)
    g.linearRampToValueAtTime(1, until + 0.03)
    this.chaffLevel = level
    this.chaffUntil = until
  }

  private duckMusic(level: number, release: number, now: number): void {
    const duck = this.musicDuck
    if (!duck) return
    const base = this.duckBase()
    const g = duck.gain
    g.cancelScheduledValues(now)
    g.setValueAtTime(g.value, now)
    g.linearRampToValueAtTime(Math.min(level, base), now + MUSIC_DUCK_ATTACK)
    g.linearRampToValueAtTime(base, now + MUSIC_DUCK_ATTACK + release)
  }

  // Every recipe is LAYERED (click transient + tonal body + low thump); the
  // weapon voices add per-shot pitch jitter so rapid fire never combs into a
  // monotone drone. Randomness here is cosmetic render-side audio.
  private recipe(name: SfxName): void {
    switch (name) {
      case 'pistol': {
        const j = jit(0.06)
        this.click(0.012, 0.22, 2400)
        this.zap(520 * j, 150, 0.09, 'square', 0.3, 3400, 900, 10)
        this.thump(190 * j, 70, 0.08, 0.3)
        break
      }
      case 'smg': {
        const j = jit(0.08)
        this.click(0.008, 0.16, 3000)
        this.zap(720 * j, 260, 0.055, 'square', 0.22, 3000, 1200, 8)
        break
      }
      case 'shotgun': {
        const j = jit(0.05)
        this.click(0.014, 0.3, 1600)
        this.noiseSweep(0.22, 0.4, 2600, 380, 'lowpass')
        this.zap(95 * j, 48, 0.16, 'sawtooth', 0.26, 1400, 300, 6)
        this.thump(150 * j, 42, 0.2, 0.5)
        break
      }
      case 'plasma': {
        const j = jit(0.05)
        this.zap(250 * j, 88, 0.18, 'sine', 0.34, 1900, 500, 24)
        this.zap(170 * j, 430, 0.1, 'sine', 0.16, 2200, 2200, 0) // rising bloop layer
        this.click(0.008, 0.1, 1400)
        break
      }
      case 'beam': {
        const j = jit(0.04)
        this.click(0.006, 0.08, 3600)
        this.zap(1150 * j, 700, 0.06, 'sawtooth', 0.13, 5200, 2400, 14)
        break
      }
      case 'heavy': {
        const j = jit(0.05)
        this.click(0.016, 0.28, 1200)
        this.noiseSweep(0.16, 0.32, 1500, 300, 'lowpass')
        this.zap(72 * j, 44, 0.22, 'sawtooth', 0.3, 900, 220, 5)
        this.thump(120 * j, 36, 0.28, 0.55)
        break
      }
      case 'whoosh':
        this.noiseSweep(0.08, 0.14, 900, 2400, 'bandpass')
        break
      case 'crack':
        this.click(0.01, 0.35, 5000)
        this.zap(2400, 300, 0.12, 'sawtooth', 0.2, 6000, 800, 20)
        this.thump(160, 40, 0.18, 0.5)
        break
      case 'hit': {
        const j = jit(0.15)
        this.click(0.01, 0.14, 2800)
        this.zap(320 * j, 170, 0.05, 'triangle', 0.1, 2400, 1200, 0)
        break
      }
      case 'crit':
        this.click(0.006, 0.12, 5000)
        this.tone(2637, 0, 0.03, 'square', 0.05)
        break
      case 'kill': {
        const j = jit(0.1)
        this.thump(230 * j, 60, 0.12, 0.3)
        this.noiseSweep(0.09, 0.24, 1800, 500, 'bandpass')
        this.zap(170 * j, 65, 0.1, 'triangle', 0.16, 1600, 400, 0)
        break
      }
      case 'gem': {
        // Classic two-step coin chirp; jitter keeps gem showers glittery.
        const j = jit(0.04)
        this.tone(988 * j, 0, 0.05, 'square', 0.12)
        this.tone(1319 * j, 0.045, 0.1, 'square', 0.14)
        this.tone(2637 * j, 0.045, 0.08, 'sine', 0.05)
        break
      }
      case 'graze':
        this.noiseSweep(0.06, 0.12, 1800, 600, 'bandpass')
        this.thump(140, 80, 0.06, 0.18)
        break
      case 'hurt':
        this.thump(120, 45, 0.16, 0.55)
        this.noiseSweep(0.12, 0.35, 2200, 400, 'lowpass')
        this.zap(180, 70, 0.12, 'sawtooth', 0.22, 1600, 300, 18)
        break
      case 'spit':
        this.noiseSweep(0.07, 0.12, 1200, 400, 'bandpass')
        this.tone(420, 0, 0.05, 'sine', 0.06)
        break
      case 'teleport':
        this.zap(900, 1800, 0.12, 'sine', 0.08, 4000, 4000, 30)
        break
      case 'tick':
        this.click(0.004, 0.06, 5000)
        break
      case 'levelup':
        // Bright ascending sparkle with a soft echo tap: a REWARD, not a beep.
        this.arp(LEVELUP_A, 0.07, 'triangle', 0.26)
        this.arp(LEVELUP_B, 0.07, 'sine', 0.08)
        this.arpAt(0.32, LEVELUP_C, 0.07, 'triangle', 0.09)
        break
      case 'weapon':
        // Chunky power-chord rack: you picked up something that matters.
        this.click(0.012, 0.2, 1800)
        this.arp(WEAPON_RACK, 0.055, 'square', 0.22)
        this.thump(150, 60, 0.12, 0.3)
        break
      case 'heal':
        this.tone(523, 0, 0.14, 'sine', 0.1)
        this.tone(659, 0.02, 0.14, 'sine', 0.08)
        this.tone(784, 0.04, 0.16, 'sine', 0.08)
        break
      case 'eliteSpawn':
      case 'alertElite':
        this.zap(185, 139, 0.45, 'sawtooth', 0.22, 900, 500, 14)
        this.thump(90, 50, 0.4, 0.35)
        break
      case 'chargerWindup':
        this.zap(300, 900, 0.6, 'square', 0.07, 1200, 3000, 6)
        break
      case 'podSpawn':
        this.tone(1568, 0, 0.08, 'sine', 0.07)
        this.tone(2093, 0.07, 0.12, 'sine', 0.07)
        break
      case 'emptyClick':
        this.click(0.01, 0.25, 3000)
        this.tone(220, 0.02, 0.05, 'square', 0.08)
        break
      case 'lowAmmo':
        this.click(0.006, 0.12, 4000)
        break
      case 'heartbeat':
        this.thump(70, 45, 0.09, 0.35)
        this.thump(70, 45, 0.09, 0.25, 0.14)
        break
      case 'ui':
        this.click(0.006, 0.1, 2200)
        this.zap(680, 940, 0.045, 'square', 0.1, 3200, 3200, 0)
        break
      case 'uiConfirm':
        this.click(0.006, 0.1, 2200)
        this.zap(680, 1020, 0.06, 'square', 0.1, 3200, 3200, 0)
        break
      case 'uiBack':
        this.zap(940, 680, 0.045, 'square', 0.08, 3200, 2400, 0)
        break
      case 'cardDeal':
        this.tone(1047, 0, 0.035, 'triangle', 0.07)
        break
      case 'countdown':
        this.tone(880, 0, 0.08, 'square', 0.1)
        break
      case 'stamp':
        this.thump(200, 60, 0.12, 0.45)
        this.click(0.02, 0.3, 1500)
        break
      case 'dash':
        this.noiseSweep(0.14, 0.18, 600, 3000, 'bandpass')
        this.zap(300, 700, 0.1, 'sine', 0.08, 2000, 2000, 0)
        break
      case 'closecall':
        this.zap(1200, 2400, 0.12, 'sine', 0.12, 5000, 5000, 0)
        this.tone(1760, 0.05, 0.1, 'triangle', 0.08)
        break
      case 'shard':
        this.tone(1319, 0, 0.06, 'sine', 0.08)
        this.tone(1760, 0.05, 0.08, 'sine', 0.07)
        break
      case 'bonus_nuke':
        this.thump(70, 30, 0.8, 0.7)
        this.noiseSweep(0.8, 0.4, 4000, 150, 'lowpass')
        break
      case 'bonus_freeze':
        this.zap(2400, 1200, 0.3, 'sine', 0.12, 6000, 3000, 0)
        this.noiseSweep(0.3, 0.1, 6000, 2000, 'highpass')
        break
      case 'bonus_overdrive':
      case 'bonus_fireblast':
        this.arp(BONUS_RUSH, 0.04, 'sawtooth', 0.15)
        break
      case 'bonus_shield':
        this.tone(523, 0, 0.3, 'sine', 0.12)
        this.tone(784, 0, 0.3, 'sine', 0.08)
        break
      case 'bonus_vacuum':
        this.zap(200, 1600, 0.4, 'sine', 0.12, 2000, 6000, 0)
        break
      case 'multUp':
        this.arp(MULT_UP, 0.04, 'square', 0.1)
        break
      case 'multBreak':
        this.zap(440, 220, 0.15, 'square', 0.12, 2000, 800, 0)
        break
      case 'alertEvent':
        this.zap(220, 165, 0.5, 'sawtooth', 0.2, 1200, 600, 10)
        this.zap(330, 247, 0.5, 'sawtooth', 0.12, 1200, 600, 10)
        break
      case 'alertBoss':
        this.thump(60, 40, 1.0, 0.6)
        this.zap(110, 82, 1.0, 'sawtooth', 0.25, 800, 300, 12)
        break
      case 'death':
        this.zap(420, 42, 0.9, 'sawtooth', 0.4, 2600, 180, 12)
        this.noiseSweep(0.7, 0.32, 1400, 140, 'lowpass')
        this.thump(160, 28, 0.5, 0.5)
        break
      case 'boss':
        // Menace: sub drop + dissonant minor-second stab + long rumble.
        this.thump(90, 26, 1.1, 0.6)
        this.arp(BOSS_STAB, 0.2, 'sawtooth', 0.3)
        this.noiseSweep(0.8, 0.22, 600, 110, 'lowpass')
        this.zap(220, 150, 0.5, 'sawtooth', 0.16, 1200, 300, 10)
        break
      case 'bossKill':
      case 'win':
        this.thump(80, 30, 0.9, 0.7)
        this.arp(BOSS_KILL_A, 0.09, 'triangle', 0.24)
        this.arpAt(0.5, BOSS_KILL_B, 0.08, 'sine', 0.1)
        this.noiseSweep(1.0, 0.25, 3000, 200, 'lowpass')
        if (name === 'win') this.arpAt(0.9, WIN_TAIL, 0.12, 'triangle', 0.2)
        break
      case 'fusion':
        this.arp(FUSION, 0.06, 'triangle', 0.2)
        this.thump(120, 60, 0.3, 0.4)
        break
      case 'evolve':
        this.arp(EVOLVE, 0.07, 'sawtooth', 0.18)
        this.thump(90, 40, 0.5, 0.5)
        break
      case 'core1':
        this.arp(CORE1, 0.08, 'sine', 0.15)
        break
      case 'core3':
        this.arp(CORE3, 0.08, 'sine', 0.18)
        break
      case 'core5':
        this.arp(CORE5, 0.08, 'triangle', 0.22)
        this.thump(100, 50, 0.4, 0.4)
        break
      case 'newBest':
      case 'feat':
        this.arp(FANFARE, 0.07, 'triangle', 0.18)
        break
    }
  }

  /**
   * The workhorse shot voice: two detuned oscillators (fat unison) sliding
   * `freq -> slideTo` through a lowpass that sweeps `cutoff0 -> cutoff1` with
   * the amp envelope. The moving filter is what reads as "pew" instead of beep.
   */
  private zap(
    freq: number,
    slideTo: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    cutoff0: number,
    cutoff1: number,
    detuneCents: number,
  ): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const p = this.pitch
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 1.1
    f.frequency.setValueAtTime(cutoff0, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(this.cur!.out!)
    const unison = detuneCents > 0 ? 2 : 1
    for (let k = 0; k < unison; k++) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.detune.value = unison === 2 ? (k === 0 ? -detuneCents : detuneCents) : 0
      osc.frequency.setValueAtTime(freq * p, t)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo * p), t + dur)
      osc.connect(f)
      osc.start(t)
      osc.stop(t + dur + 0.02)
      this.track(osc, t + dur + 0.02)
    }
  }

  /** One plain note at a scheduled offset (the coin-chirp building block). */
  private tone(freq: number, delay: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq * this.pitch
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.cur!.out!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    this.track(osc, t + dur + 0.02)
  }

  /** Sine pitch-drop: the low-end weight under shots, kills, and bosses. */
  private thump(f0: number, f1: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx!
    const t = ctx.currentTime + delay
    const p = this.pitch
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0 * p, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * p), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.cur!.out!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
    this.track(osc, t + dur + 0.02)
  }

  /** Millisecond noise tick: the "mechanism" transient that sells impact. */
  private click(dur: number, gain: number, cutoff: number): void {
    this.noiseSweep(dur, gain, cutoff, cutoff, 'highpass')
  }

  /** Filtered noise burst whose cutoff sweeps with the decay (bodies, blasts). */
  private noiseSweep(dur: number, gain: number, cutoff0: number, cutoff1: number, filter: BiquadFilterType): void {
    const ctx = this.ctx!
    const buf = this.noiseBuf
    if (!buf) return
    const t = ctx.currentTime
    const src = ctx.createBufferSource()
    src.buffer = buf
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.setValueAtTime(cutoff0, t)
    if (cutoff1 !== cutoff0) f.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff1), t + dur)
    if (filter === 'bandpass') f.Q.value = 0.9
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.cur!.out!)
    // Random start offset into the shared bed so bursts never sound looped.
    src.start(t, Math.random() * Math.max(0, buf.duration - dur - 0.05), dur + 0.02)
    this.track(src, t + dur + 0.02)
  }

  private arp(freqs: readonly number[], step: number, type: OscillatorType, gain: number): void {
    this.arpAt(0, freqs, step, type, gain)
  }

  private arpAt(delay: number, freqs: readonly number[], step: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!
    const p = this.pitch
    for (let i = 0; i < freqs.length; i++) {
      const t = ctx.currentTime + delay + i * step
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.value = freqs[i]! * p
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.4)
      osc.connect(g).connect(this.cur!.out!)
      osc.start(t)
      osc.stop(t + step * 1.5)
      this.track(osc, t + step * 1.5)
    }
  }

  // --- Adaptive music --------------------------------------------------------

  /** Call once per frame; schedules upcoming notes (look-ahead scheduler). */
  updateMusic(): void {
    if (!this.unlocked || !this.ctx || !this.musicBus) return
    const ctx = this.ctx
    // Self-heal: the context can be suspended/interrupted out from under us (a
    // tab switch, the OS taking audio focus, a phone interruption), and it never
    // resumes on its own. That's how audio "just stops" (e.g. after tabbing away
    // on the game-over screen, then starting a new run). Nudge it back here, every
    // frame, and resync the clock so we don't burst a pile of past-due notes.
    if (ctx.state !== 'running') {
      void ctx.resume().catch(() => {})
      this.nextNoteTime = ctx.currentTime
      return
    }
    // Recover from a long stall (a backgrounded tab throttles rAF, so this isn't
    // called while the audio clock keeps running) without scheduling a burst.
    if (this.nextNoteTime < ctx.currentTime - 0.5) this.nextNoteTime = ctx.currentTime
    const bpm = this.theme.bpmBase + this.intensity * this.theme.bpmRange
    const beat = 60 / bpm
    while (this.nextNoteTime < ctx.currentTime + 0.12) {
      this.scheduleStep(this.nextNoteTime, beat)
      this.nextNoteTime += beat / 2 // eighth notes
      this.musicStep++
    }
  }

  // Bass on the beat, sparse arp that thickens with intensity. Note tables,
  // waveforms, tempo, and filter sweeps all come from the active MusicTheme.
  private scheduleStep(t: number, beat: number): void {
    const th = this.theme
    const i = this.musicStep
    if (i % 2 === 0) {
      const bass = th.bassNotes[(i / 2) % th.bassNotes.length]!
      this.note(bass, t, beat * 0.9, th.bassWave, 0.16, th.bassCutoffBase + this.intensity * th.bassCutoffRange)
    }
    if (this.intensity > 0.25 && (i % 2 === 1 || this.intensity > 0.6)) {
      const arp = th.arpNotes[i % th.arpNotes.length]!
      this.note(arp, t, beat * 0.4, th.arpWave, 0.05 + this.intensity * 0.06, th.arpCutoffBase + this.intensity * th.arpCutoffRange)
    }
  }

  private note(freq: number, t: number, dur: number, type: OscillatorType, gain: number, cutoff: number): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    f.type = 'lowpass'
    f.frequency.value = cutoff
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(f).connect(g).connect(this.musicBus!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }
}

/** Cosmetic pitch jitter multiplier (audio only; the sim never sees this). */
function jit(pct: number): number {
  return 1 + (Math.random() * 2 - 1) * pct
}

/** A pan bus feeding `into`. Browsers without StereoPannerNode get a
 *  pass-through gain (center). */
function makePan(ctx: AudioContext, pan: number, into: AudioNode): AudioNode {
  if (typeof ctx.createStereoPanner !== 'function') {
    const g = ctx.createGain()
    g.connect(into)
    return g
  }
  const p = ctx.createStereoPanner()
  p.pan.value = pan
  p.connect(into)
  return p
}
