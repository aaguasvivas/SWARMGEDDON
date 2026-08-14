/**
 * Procedural audio — fully synthesized via the Web Audio API. No sample files,
 * so there's nothing to download (instant load) and the whole soundscape is
 * data-light. Layered SFX per event + an adaptive music bed whose intensity
 * tracks the on-screen chaos.
 *
 * Mobile browsers block audio until a user gesture; `attachUnlock()` resumes the
 * context (and starts music) on the first tap/key. Everything no-ops until then.
 */
export type SfxName =
  | 'pistol'
  | 'smg'
  | 'shotgun'
  | 'plasma'
  | 'beam'
  | 'heavy'
  | 'hit'
  | 'kill'
  | 'levelup'
  | 'pickup'
  | 'weapon'
  | 'death'
  | 'boss'
  | 'ui'

/** Per-world music identity — pure data over the same look-ahead scheduler. */
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

export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private sfxBus: GainNode | null = null
  private musicBus: GainNode | null = null
  private noiseBuf: AudioBuffer | null = null
  private unlocked = false
  private musicStep = 0
  private nextNoteTime = 0
  /** 0..1, set by the game to scale music density/brightness. */
  intensity = 0

  private vol = { master: 0.8, sfx: 0.9, music: 0.55 }
  private throttle = new Map<SfxName, number>()
  private theme: MusicTheme = DEFAULT_MUSIC_THEME

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

  /** Wire one-time gesture listeners that create + resume the audio context. */
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
    const musicBus = ctx.createGain()
    musicBus.gain.value = this.vol.music
    musicBus.connect(master)
    // One shared noise bed reused by every burst (random start offset), instead
    // of allocating a fresh AudioBuffer per shot (GC churn in heavy combat).
    const frames = ctx.sampleRate
    const noiseBuf = ctx.createBuffer(1, frames, ctx.sampleRate)
    const nd = noiseBuf.getChannelData(0)
    for (let i = 0; i < frames; i++) nd[i] = Math.random() * 2 - 1
    this.noiseBuf = noiseBuf
    this.ctx = ctx
    this.master = master
    this.sfxBus = sfxBus
    this.musicBus = musicBus
    this.unlocked = true
    this.nextNoteTime = ctx.currentTime
  }

  // --- SFX -------------------------------------------------------------------

  play(name: SfxName): void {
    if (!this.unlocked || !this.ctx || !this.sfxBus) return
    // While suspended/interrupted (iOS call banner, Siri, audio-focus loss) the
    // audio clock FREEZES: every node scheduled here would stack on one frozen
    // timestamp and all detonate together when updateMusic() resumes the
    // context. Drop SFX until it's running again (updateMusic self-heals it).
    if (this.ctx.state !== 'running') return
    // Throttle the spammy ones so a 500-enemy wipe doesn't create a node storm.
    const now = this.ctx.currentTime
    const minGap = name === 'hit' ? 0.03 : name === 'kill' ? 0.04 : name === 'pickup' ? 0.06 : 0
    if (minGap > 0) {
      const last = this.throttle.get(name) ?? 0
      if (now - last < minGap) return
      this.throttle.set(name, now)
    }

    // Every recipe is LAYERED (click transient + tonal body + low thump) with
    // per-shot pitch jitter so rapid fire never combs into a monotone drone.
    // Randomness here is cosmetic render-side audio; it never touches the sim.
    switch (name) {
      case 'pistol': {
        const j = this.jit(1, 0.06)
        this.click(0.012, 0.22, 2400)
        this.zap(520 * j, 150, 0.09, 'square', 0.3, 3400, 900, 10)
        this.thump(190 * j, 70, 0.08, 0.3)
        break
      }
      case 'smg': {
        const j = this.jit(1, 0.08)
        this.click(0.008, 0.16, 3000)
        this.zap(720 * j, 260, 0.055, 'square', 0.22, 3000, 1200, 8)
        break
      }
      case 'shotgun': {
        const j = this.jit(1, 0.05)
        this.click(0.014, 0.3, 1600)
        this.noiseSweep(0.22, 0.4, 2600, 380, 'lowpass')
        this.zap(95 * j, 48, 0.16, 'sawtooth', 0.26, 1400, 300, 6)
        this.thump(150 * j, 42, 0.2, 0.5)
        break
      }
      case 'plasma': {
        const j = this.jit(1, 0.05)
        this.zap(250 * j, 88, 0.18, 'sine', 0.34, 1900, 500, 24)
        this.zap(170 * j, 430, 0.1, 'sine', 0.16, 2200, 2200, 0) // rising bloop layer
        this.click(0.008, 0.1, 1400)
        break
      }
      case 'beam': {
        const j = this.jit(1, 0.04)
        this.click(0.006, 0.08, 3600)
        this.zap(1150 * j, 700, 0.06, 'sawtooth', 0.13, 5200, 2400, 14)
        break
      }
      case 'heavy': {
        const j = this.jit(1, 0.05)
        this.click(0.016, 0.28, 1200)
        this.noiseSweep(0.16, 0.32, 1500, 300, 'lowpass')
        this.zap(72 * j, 44, 0.22, 'sawtooth', 0.3, 900, 220, 5)
        this.thump(120 * j, 36, 0.28, 0.55)
        break
      }
      case 'hit': {
        const j = this.jit(1, 0.15)
        this.click(0.01, 0.14, 2800)
        this.zap(320 * j, 170, 0.05, 'triangle', 0.1, 2400, 1200, 0)
        break
      }
      case 'kill': {
        const j = this.jit(1, 0.1)
        this.thump(230 * j, 60, 0.12, 0.3)
        this.noiseSweep(0.09, 0.24, 1800, 500, 'bandpass')
        this.zap(170 * j, 65, 0.1, 'triangle', 0.16, 1600, 400, 0)
        break
      }
      case 'levelup':
        // Bright ascending sparkle with a soft echo tap: a REWARD, not a beep.
        this.arp([523, 659, 784, 1047, 1319], 0.07, 'triangle', 0.26)
        this.arp([1047, 1319, 1568, 2093, 2637], 0.07, 'sine', 0.08)
        this.arpAt(0.32, [1047, 1319, 1568], 0.07, 'triangle', 0.09)
        break
      case 'pickup': {
        // Classic two-step coin chirp; jitter keeps gem showers glittery.
        const j = this.jit(1, 0.04)
        this.tone(988 * j, 0, 0.05, 'square', 0.12)
        this.tone(1319 * j, 0.045, 0.1, 'square', 0.14)
        this.tone(2637 * j, 0.045, 0.08, 'sine', 0.05)
        break
      }
      case 'weapon':
        // Chunky power-chord rack: you picked up something that matters.
        this.click(0.012, 0.2, 1800)
        this.arp([196, 392, 587, 784], 0.055, 'square', 0.22)
        this.thump(150, 60, 0.12, 0.3)
        break
      case 'death':
        this.zap(420, 42, 0.9, 'sawtooth', 0.4, 2600, 180, 12)
        this.noiseSweep(0.7, 0.32, 1400, 140, 'lowpass')
        this.thump(160, 28, 0.5, 0.5)
        break
      case 'boss':
        // Menace: sub drop + dissonant minor-second stab + long rumble.
        this.thump(90, 26, 1.1, 0.6)
        this.arp([110, 116.5, 146.8], 0.2, 'sawtooth', 0.3)
        this.noiseSweep(0.8, 0.22, 600, 110, 'lowpass')
        this.zap(220, 150, 0.5, 'sawtooth', 0.16, 1200, 300, 10)
        break
      case 'ui':
        this.click(0.006, 0.1, 2200)
        this.zap(680, 940, 0.045, 'square', 0.1, 3200, 3200, 0)
        break
    }
  }

  /** Cosmetic pitch jitter multiplier (audio only; the sim never sees this). */
  private jit(base: number, pct: number): number {
    return base * (1 + (Math.random() * 2 - 1) * pct)
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
    const f = ctx.createBiquadFilter()
    f.type = 'lowpass'
    f.Q.value = 1.1
    f.frequency.setValueAtTime(cutoff0, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(80, cutoff1), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(this.sfxBus!)
    const voices = detuneCents > 0 ? [-detuneCents, detuneCents] : [0]
    for (const cents of voices) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.detune.value = cents
      osc.frequency.setValueAtTime(freq, t)
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur)
      osc.connect(f)
      osc.start(t)
      osc.stop(t + dur + 0.02)
    }
  }

  /** One plain note at a scheduled offset (the coin-chirp building block). */
  private tone(freq: number, delay: number, dur: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.value = freq
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.sfxBus!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** Sine pitch-drop: the low-end weight under shots, kills, and bosses. */
  private thump(f0: number, f1: number, dur: number, gain: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(f0, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.sfxBus!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** Millisecond noise tick: the "mechanism" transient that sells impact. */
  private click(dur: number, gain: number, cutoff: number): void {
    this.playNoise(dur, gain, cutoff, cutoff, 'highpass')
  }

  /** Filtered noise burst whose cutoff sweeps with the decay (bodies, blasts). */
  private noiseSweep(dur: number, gain: number, cutoff0: number, cutoff1: number, filter: BiquadFilterType): void {
    this.playNoise(dur, gain, cutoff0, cutoff1, filter)
  }

  private playNoise(dur: number, gain: number, cutoff0: number, cutoff1: number, filter: BiquadFilterType): void {
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
    src.connect(f).connect(g).connect(this.sfxBus!)
    // Random start offset into the shared 1s bed so bursts never sound looped.
    src.start(t, Math.random() * (buf.duration - dur - 0.05), dur + 0.02)
  }

  private arp(freqs: number[], step: number, type: OscillatorType, gain: number): void {
    this.arpAt(0, freqs, step, type, gain)
  }

  private arpAt(delay: number, freqs: number[], step: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + delay + i * step
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = type
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01)
      g.gain.exponentialRampToValueAtTime(0.0001, t + step * 1.4)
      osc.connect(g).connect(this.sfxBus!)
      osc.start(t)
      osc.stop(t + step * 1.5)
    })
  }

  // --- Adaptive music --------------------------------------------------------

  /** Call once per frame; schedules upcoming notes (look-ahead scheduler). */
  updateMusic(): void {
    if (!this.unlocked || !this.ctx || !this.musicBus) return
    const ctx = this.ctx
    // Self-heal: the context can be suspended/interrupted out from under us — a
    // tab switch, the OS taking audio focus, a phone interruption — and it never
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

  // Bass on the beat, sparse arp that thickens with intensity — note tables,
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
