import { Container, Graphics, Text } from 'pixi.js'
import { FeelKind, type FeelQueue } from '../effects/feelQueue.ts'
import type { World } from '../game/world.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'
import { CALLOUT, type Callouts } from './callouts.ts'
import { FONT, INK, RADIUS, T } from './tokens.ts'

/** Section 9.10: how many times each hint shows, and its line. */
const HINTS = {
  controls_kbm: { max: 2, text: 'WASD MOVE · MOUSE AIM · HOLD CLICK TO FIRE · SPACE DASH · ESC PAUSE' },
  dash: { max: 1, text: 'Tap DASH to dodge through danger' },
  draft: { max: 2, text: 'Pick one. Perks last the whole run.' },
  pod: { max: 1, text: 'HOLD STILL ON A POD TO TAKE IT. LIMITED AMMO.' },
  elite: { max: 1, text: 'ELITE INCOMING. ELITES DROP CORE SHARDS.' },
  boss: { max: 1, text: 'BOSS FIGHT. THE CAGE HOLDS THE SWARM OUT.' },
  mult: { max: 1, text: 'MULTIPLIER x2. KEEP KILLING. HITS HALVE IT.' },
  mult_hit: { max: 1, text: 'HIT. MULTIPLIER HALVED.' },
  closecall: { max: 1, text: 'CLOSE CALL. DASH THROUGH DANGER TO RECHARGE FASTER.' },
  daily: { max: 1, text: 'Same seed, world and pilot for everyone today. Your first run counts.' },
  feats: { max: 1, text: 'Feats unlock pilots, worlds, weapons and paints. See RECORDS.' },
  pause: { max: 1, text: 'Pause' },
} as const
export type HintId = keyof typeof HINTS
const POD_INSTANT = 'WALK OVER A POD TO TAKE IT. LIMITED AMMO.'
const GEM_TEXT = 'COLLECT FOR XP'

const KEY = 'hints'
const QUEUE = 2
/** A queued hint older than this (real seconds) is dropped unshown. */
const STALE_S = 12
/** No hint starts this long after a boss arrives (its intro and alert). */
const BOSS_INTRO_S = 3.5
/** A hint longer than this (characters) takes two lines. */
const HINT_ONE_LINE = 30
const DASH_AT_S = 8
const PAUSE_AT_S = 20
const CHIP_S = 3.5

/**
 * First-time hints (section 9.10, key `hints`: show counts per id). In a run
 * they are lines in the callout lane, one at a time with a queue of 2, never
 * during a draft or a boss intro. They read the FeelQueue before the
 * FeelDirector drains it and never touch the sim. The gem hint keeps the v1
 * `seenGemHint` key. The `pause` hint is a chip under the pause button.
 */
export class Hints {
  /** The `Pause` chip (screen space, in the UI layer). */
  readonly chip = new Container()
  private readonly chipBg = new Graphics()
  private readonly chipText: Text
  private chipLeft = 0
  private counts: Record<string, number> = {}
  /** Queued hint ids ('gem' is the v1 gem hint) and when each was queued. */
  private readonly queue: (HintId | 'gem')[] = []
  private readonly queuedAt: number[] = []
  private clock = 0
  private quietUntil = 0
  private touch = false
  private gemSeen = true
  private dashDone = false
  private pauseDone = false

  constructor(private readonly callouts: Callouts) {
    this.chipText = new Text({ text: HINTS.pause.text, style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: 13, fill: INK } })
    this.chipText.anchor.set(0, 0.5)
    this.chip.addChild(this.chipBg, this.chipText)
    this.chip.eventMode = 'none'
    this.chip.visible = false
    this.load()
  }

  /** SHOW TIPS AGAIN: forget every hint, the gem hint and the touch guide. */
  reset(): void {
    saveJSON(KEY, {})
    saveJSON('seenGemHint', false)
    saveJSON('seenTouchControls', false)
    this.load()
  }

  /** A new run: `touch` picks the touch hints over the keyboard one. */
  beginRun(touch: boolean): void {
    this.load()
    this.touch = touch
    this.queue.length = 0
    this.queuedAt.length = 0
    this.quietUntil = 0
    this.dashDone = this.pauseDone = false
    this.chipLeft = 0
    this.chip.visible = false
    if (!touch) this.want('controls_kbm')
  }

  /** Watch this frame's sim events (before FeelDirector.drain empties the queue). */
  scan(q: FeelQueue, w: World): void {
    const n = q.n
    for (let i = 0; i < n; i++) {
      switch (q.kind[i] as FeelKind) {
        case FeelKind.PodSpawn:
          this.want('pod')
          break
        case FeelKind.EliteSpawn:
          this.want('elite')
          break
        case FeelKind.BossSpawn:
          this.quietUntil = this.clock + BOSS_INTRO_S
          this.want('boss')
          break
        case FeelKind.MultUp:
          if (q.a[i]! >= 2) this.want('mult')
          break
        case FeelKind.ChainHit:
          // registerHit emits MultDown, then ChainHit: a hit that dropped the tier.
          if (i > 0 && (q.kind[i - 1] as FeelKind) === FeelKind.MultDown) this.want('mult_hit')
          break
        case FeelKind.CloseCall:
          this.want('closecall')
          break
      }
    }
    if (!this.gemSeen && w.firstGemAt >= 0) {
      this.gemSeen = true
      this.push('gem')
    }
  }

  /** Advance by `fd` real seconds; start the next hint when the lane is free.
   *  `chipFree`: the chip's slot is empty (no LEVEL UP chip in it). */
  update(fd: number, w: World, playing: boolean, chipFree: boolean): void {
    this.clock += fd
    // The chip's 3.5 s count down only while it can show: a draft, a pause or
    // a LEVEL UP chip in its slot holds them.
    if (this.chipLeft > 0) {
      const show = playing && !w.paused && chipFree
      if (show) this.chipLeft -= fd
      this.chip.visible = show && this.chipLeft > 0
    }
    if (!playing || w.paused || w.pendingGameOver) return
    if (this.touch && !this.dashDone && w.time >= DASH_AT_S) {
      this.dashDone = true
      this.want('dash')
    }
    if (this.touch && !this.pauseDone && chipFree && w.time >= PAUSE_AT_S) {
      this.pauseDone = true
      if (this.take('pause')) {
        this.chip.visible = true
        this.chipLeft = CHIP_S
      }
    }
    while (this.queue.length > 0 && this.clock - this.queuedAt[0]! > STALE_S) {
      this.queue.shift()
      this.queuedAt.shift()
    }
    if (this.queue.length === 0 || this.clock < this.quietUntil || !this.callouts.idle()) return
    const id = this.queue.shift()!
    this.queuedAt.shift()
    let line: string
    if (id === 'gem') {
      saveJSON('seenGemHint', true)
      line = GEM_TEXT
    } else {
      if (!this.take(id)) return
      line = id === 'pod' && w.character.rules.podHold === 0 ? POD_INSTANT : HINTS[id].text
    }
    this.callouts.show(CALLOUT.hint, '', line.length > HINT_ONE_LINE ? balance(line) : line, T.textHi)
  }

  /** The line of a hint shown outside a run (the Daily card, the recap), once
   *  per its limit; null when it has shown enough. */
  once(id: 'daily' | 'feats'): string | null {
    return this.take(id) ? HINTS[id].text : null
  }

  /** Count one showing of a counter kept beside the hint ids in the same
   *  record (the draft controls hint); returns the count before it. */
  bump(id: string): number {
    const n = typeof this.counts[id] === 'number' ? this.counts[id]! : 0
    this.counts[id] = n + 1
    saveJSON(KEY, this.counts)
    return n
  }

  /** The draft's subtitle for the first drafts per install, or ''. */
  draftLine(): string {
    return this.take('draft') ? HINTS.draft.text : ''
  }

  /** Put the chip's top-left at (x, y) screen px, under the pause button in the
   *  HUD row the LEVEL UP chip uses (the plate beside the button holds the level
   *  chip and the XP bar), scaled like the HUD. */
  layoutChip(x: number, y: number, s: number): void {
    const w = this.chipText.width + 16
    this.chipBg.clear()
    this.chipBg.roundRect(0, -12, w, 24, RADIUS.chip).fill(T.accentGold)
    this.chipText.position.set(8, 0)
    this.chip.scale.set(s)
    this.chip.position.set(x, y + 12 * s)
  }

  private load(): void {
    const v = loadJSON<unknown>(KEY, {})
    this.counts = v && typeof v === 'object' && !Array.isArray(v) ? { ...(v as Record<string, number>) } : {}
    this.gemSeen = loadJSON<unknown>('seenGemHint', false) === true
  }

  /** Count one showing of `id`; false when it already showed its limit. */
  private take(id: HintId): boolean {
    const n = typeof this.counts[id] === 'number' ? this.counts[id]! : 0
    if (n >= HINTS[id].max) return false
    this.counts[id] = n + 1
    saveJSON(KEY, this.counts)
    return true
  }

  /** Queue `id` when it has shows left; it counts when it shows. */
  private want(id: HintId): void {
    const n = typeof this.counts[id] === 'number' ? this.counts[id]! : 0
    if (n < HINTS[id].max && this.queue.indexOf(id) < 0) this.push(id)
  }

  private push(id: HintId | 'gem'): void {
    if (this.queue.length >= QUEUE) return
    this.queue.push(id)
    this.queuedAt.push(this.clock)
  }
}

/** Two lines of near-equal length, broken at the ` · ` nearest the middle,
 *  else at the space nearest the middle (event rate). */
function balance(s: string): string {
  const mid = s.length / 2
  const sep = ' \u00b7 '
  let at = -1
  let len = 1
  for (let i = s.indexOf(sep); i >= 0; i = s.indexOf(sep, i + 1)) if (at < 0 || Math.abs(i - mid) < Math.abs(at - mid)) at = i
  if (at >= 0) len = sep.length
  else for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (at < 0 || Math.abs(i - mid) < Math.abs(at - mid))) at = i
  return at < 0 ? s : s.slice(0, at) + '\n' + s.slice(at + len)
}
