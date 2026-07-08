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
    const sfxBus = ctx.createGain()
    sfxBus.gain.value = this.vol.sfx
    sfxBus.connect(master)
    const musicBus = ctx.createGain()
    musicBus.gain.value = this.vol.music
    musicBus.connect(master)
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

    switch (name) {
      case 'pistol':
        this.blip(420, 0.08, 'square', 0.5, 180)
        this.noise(0.04, 0.25, 1800)
        break
      case 'smg':
        this.blip(620, 0.05, 'square', 0.32, 320)
        break
      case 'shotgun':
        this.noise(0.18, 0.5, 1200, 'lowpass')
        this.blip(120, 0.18, 'sawtooth', 0.4, 60)
        break
      case 'plasma':
        this.blip(300, 0.16, 'sine', 0.4, 1100)
        break
      case 'beam':
        this.blip(880, 0.05, 'sawtooth', 0.18, 920)
        break
      case 'heavy':
        this.noise(0.1, 0.4, 800, 'lowpass')
        this.blip(90, 0.2, 'sawtooth', 0.5, 50)
        break
      case 'hit':
        this.noise(0.05, 0.22, 2600)
        break
      case 'kill':
        this.blip(180, 0.12, 'triangle', 0.32, 80)
        this.noise(0.08, 0.3, 1400, 'lowpass')
        break
      case 'levelup':
        this.arp([523, 659, 784, 1047], 0.09, 'triangle', 0.32)
        break
      case 'pickup':
        this.blip(880, 0.1, 'sine', 0.3, 1320)
        break
      case 'weapon':
        this.arp([392, 587, 784], 0.08, 'square', 0.3)
        break
      case 'death':
        this.blip(320, 0.7, 'sawtooth', 0.5, 60)
        this.noise(0.5, 0.4, 900, 'lowpass')
        break
      case 'boss':
        this.blip(70, 1.0, 'sawtooth', 0.6, 48)
        this.arp([110, 138, 146], 0.22, 'sawtooth', 0.4)
        break
      case 'ui':
        this.blip(660, 0.05, 'square', 0.22, 760)
        break
    }
  }

  /** A pitched tone with an exponential pitch slide and AD envelope. */
  private blip(freq: number, dur: number, type: OscillatorType, gain: number, slideTo: number): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + 0.005)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    osc.connect(g).connect(this.sfxBus!)
    osc.start(t)
    osc.stop(t + dur + 0.02)
  }

  /** A filtered noise burst (impacts, explosions). */
  private noise(dur: number, gain: number, cutoff: number, filter: BiquadFilterType = 'highpass'): void {
    const ctx = this.ctx!
    const t = ctx.currentTime
    const frames = Math.floor(ctx.sampleRate * dur)
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const f = ctx.createBiquadFilter()
    f.type = filter
    f.frequency.value = cutoff
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(this.sfxBus!)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  private arp(freqs: number[], step: number, type: OscillatorType, gain: number): void {
    const ctx = this.ctx!
    freqs.forEach((f, i) => {
      const t = ctx.currentTime + i * step
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
