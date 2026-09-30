import { Container, Sprite, Text } from 'pixi.js'
import { CH_BANG, CH_K, CH_PLUS, layoutGlyphs, numGlyphs, writeInt } from '../ui/digits.ts'
import { FONT, INK, T, ensureContrast } from '../ui/tokens.ts'
import { setTint } from '../render/textures.ts'

export type DamageNumberMode = 'all' | 'big' | 'off'

const CAP = 64
const GLYPHS = 6
const BIG_HIT = 25
const HUGE_HIT = 100
/** Mode `big` shows a number once its total reaches this. Every pilot's base
 *  weapon hit clears it; chip and armor-blunted hits show as collected totals. */
const BIG_MIN = 10
const POP_FROM = 1.4
const POP_MS = 90
const RISE_PX = 26
const RISE_MS = 450
const LIFE_MS = 600
const CRIT_LIFE_MS = 700
const FADE_MS = 180
const MERGE_MS = 150
const CRIT_SHAKE_PX = 4
const CRIT_SHAKE_MS = 80
/** Numbers start this far above the hit, in screen px. */
const LIFT_PX = 14

const KIND_HIT = 0
const KIND_CRIT = 1
const KIND_HEAL = 2

const LABEL_CAP = 8
const LABEL_PX = 16
const LABEL_RISE_PX = 14

/**
 * Damage numbers (section 6.4, tiers in A18): 64 pooled numbers of 6 glyph
 * sprites from the numMono atlas, drawn in the unbloomed world-space overlay at
 * a constant screen size. Hits on one enemy within 150 ms add into the number
 * already rising over it. In mode `big` a smaller hit opens a hidden number
 * that collects every hit on that enemy for up to 450 ms and shows once its
 * total reaches BIG_MIN; crits and heals show at once. `off` shows none.
 *
 * `label()` is the world-space text line for pickups, alerts and boss kills
 * until the callout lane replaces it.
 */
export class DamageNumbers {
  readonly view = new Container()
  mode: DamageNumberMode = 'big'
  private readonly boxes: Container[] = []
  private readonly glyphs: Sprite[][] = []
  private readonly live = new Uint8Array(CAP)
  private readonly kind = new Uint8Array(CAP)
  private readonly x = new Float32Array(CAP)
  private readonly y = new Float32Array(CAP)
  private readonly value = new Float32Array(CAP)
  private readonly size = new Float32Array(CAP)
  private readonly born = new Float64Array(CAP)
  private readonly popAt = new Float64Array(CAP)
  private readonly lastHit = new Float64Array(CAP)
  private readonly life = new Float32Array(CAP)
  private readonly uid = new Int32Array(CAP)
  private readonly shown = new Uint8Array(CAP)
  private readonly codes = new Uint8Array(GLYPHS)

  private readonly labels: Text[] = []
  private readonly labelBorn = new Float64Array(LABEL_CAP)
  private readonly labelLife = new Float32Array(LABEL_CAP)
  private readonly labelX = new Float32Array(LABEL_CAP)
  private readonly labelY = new Float32Array(LABEL_CAP)
  private readonly labelLift = new Float32Array(LABEL_CAP)
  private now = 0
  private readonly em: number

  constructor() {
    const g = numGlyphs()
    this.em = g.em
    for (let i = 0; i < CAP; i++) {
      const box = new Container()
      box.visible = false
      const row: Sprite[] = []
      for (let j = 0; j < GLYPHS; j++) {
        const s = new Sprite(g.tex[48]!)
        s.anchor.set(0, 0.5)
        s.visible = false
        row.push(s)
        box.addChild(s)
      }
      this.boxes.push(box)
      this.glyphs.push(row)
      this.view.addChild(box)
    }
    for (let i = 0; i < LABEL_CAP; i++) {
      const t = new Text({
        text: '',
        style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: LABEL_PX, fill: 0xffffff, stroke: { color: INK, width: 4, join: 'round' } },
      })
      t.anchor.set(0.5)
      t.visible = false
      this.labels.push(t)
      this.view.addChild(t)
    }
  }

  /** `uid` is the struck enemy's uid when the sim emitted the hit (0 = none). */
  hit(x: number, y: number, dmg: number, crit: boolean, uid: number): void {
    if (this.mode === 'off' || dmg <= 0) return
    if (uid > 0) {
      for (let i = 0; i < CAP; i++) {
        if (!this.live[i] || this.uid[i] !== uid || this.now - this.born[i]! >= RISE_MS) continue
        if (this.shown[i] && this.now - this.lastHit[i]! >= MERGE_MS) continue
        this.lastHit[i] = this.now
        if (crit) this.kind[i] = KIND_CRIT
        this.value[i] = this.value[i]! + dmg
        if (this.shown[i]) {
          this.popAt[i] = this.now
          this.draw(i)
        } else if (this.mode === 'all' || crit || this.value[i]! >= BIG_MIN) {
          this.reveal(i, x, y)
        }
        return
      }
    }
    const show = this.mode === 'all' || crit || dmg >= BIG_MIN
    if (!show && uid <= 0) return
    const i = this.acquire(show)
    if (i < 0) return
    this.start(i, x, y, crit ? KIND_CRIT : KIND_HIT, dmg, uid, show)
  }

  heal(x: number, y: number, hp: number): void {
    if (this.mode === 'off' || hp <= 0) return
    const i = this.acquire(true)
    if (i < 0) return
    this.start(i, x, y, KIND_HEAL, hp, 0, true)
  }

  /** A text line `liftPx` screen px above world point (x, y), whatever the zoom. */
  label(text: string, x: number, y: number, liftPx: number, color: number, life = 1.1): void {
    let slot = 0
    for (let i = 0; i < LABEL_CAP; i++) {
      if (!this.labels[i]!.visible) {
        slot = i
        break
      }
      if (this.labelBorn[i]! < this.labelBorn[slot]!) slot = i
    }
    const t = this.labels[slot]!
    t.text = text
    t.style.fill = ensureContrast(color, INK)
    t.visible = true
    this.labelBorn[slot] = this.now
    this.labelLife[slot] = life * 1000
    this.labelX[slot] = x
    this.labelY[slot] = y
    this.labelLift[slot] = liftPx
  }

  /** Once per render frame on the real clock; `zoom` keeps the size constant on screen. */
  update(nowMs: number, zoom: number): void {
    this.now = nowMs
    const inv = 1 / zoom
    for (let i = 0; i < CAP; i++) {
      if (!this.live[i]) continue
      const age = nowMs - this.born[i]!
      if (!this.shown[i]) {
        if (age >= RISE_MS) this.live[i] = 0
        continue
      }
      const left = this.life[i]! - age
      const box = this.boxes[i]!
      if (left <= 0) {
        this.live[i] = 0
        box.visible = false
        continue
      }
      const k = age < RISE_MS ? age / RISE_MS : 1
      const u = 1 - k
      const rise = RISE_PX * (1 - u * u * u)
      const pa = nowMs - this.popAt[i]!
      const pop = pa < POP_MS ? POP_FROM + (1 - POP_FROM) * (pa / POP_MS) : 1
      const shake = this.kind[i] === KIND_CRIT && pa < CRIT_SHAKE_MS ? CRIT_SHAKE_PX * Math.sin(pa * 0.35) : 0
      box.position.set(this.x[i]! + shake * inv, this.y[i]! - (LIFT_PX + rise) * inv)
      box.scale.set((this.size[i]! / this.em) * pop * inv)
      box.alpha = left < FADE_MS ? left / FADE_MS : 1
    }
    for (let i = 0; i < LABEL_CAP; i++) {
      const t = this.labels[i]!
      if (!t.visible) continue
      const age = nowMs - this.labelBorn[i]!
      const life = this.labelLife[i]!
      if (age >= life) {
        t.visible = false
        continue
      }
      const k = 1 - age / life
      const u = Math.min(1, age / 700)
      t.position.set(this.labelX[i]!, this.labelY[i]! - (this.labelLift[i]! + LABEL_RISE_PX * (1 - (1 - u) * (1 - u))) * inv)
      t.alpha = k
      t.scale.set((1 + (1 - k) * 0.3) * inv)
    }
  }

  clear(): void {
    for (let i = 0; i < CAP; i++) {
      this.live[i] = 0
      this.shown[i] = 0
      this.boxes[i]!.visible = false
    }
    for (const t of this.labels) t.visible = false
  }

  /** A free slot; when the pool is full, a number that will show takes a
   *  hidden one's slot, so pending sub-threshold totals never block it. */
  private acquire(show: boolean): number {
    let hidden = -1
    for (let i = 0; i < CAP; i++) {
      if (!this.live[i]) return i
      if (hidden < 0 && !this.shown[i]) hidden = i
    }
    return show ? hidden : -1
  }

  private start(i: number, x: number, y: number, kind: number, v: number, uid: number, show: boolean): void {
    this.live[i] = 1
    this.kind[i] = kind
    this.value[i] = v
    this.uid[i] = uid
    this.lastHit[i] = this.now
    this.born[i] = this.now
    this.shown[i] = 0
    this.boxes[i]!.visible = false
    if (show) this.reveal(i, x, y)
  }

  /** Show slot `i` at the latest hit; its rise and life start now. */
  private reveal(i: number, x: number, y: number): void {
    this.shown[i] = 1
    this.x[i] = x
    this.y[i] = y
    this.born[i] = this.now
    this.popAt[i] = this.now
    this.boxes[i]!.visible = true
    this.draw(i)
  }

  /** Glyphs, tint, size and life for slot `i`'s current value and kind. */
  private draw(i: number): void {
    const kind = this.kind[i]!
    const v = Math.round(this.value[i]!)
    const c = this.codes
    let n = 0
    if (kind === KIND_HEAL) c[n++] = CH_PLUS
    if (v > 99999) {
      n = writeInt(c, n, Math.floor(v / 1000), false)
      if (n < GLYPHS) c[n++] = CH_K
    } else {
      n = writeInt(c, n, v, false)
    }
    if (kind === KIND_CRIT && n < GLYPHS) c[n++] = CH_BANG
    let tint: number
    let size: number
    if (kind === KIND_HEAL) {
      tint = 0x4dffa0
      size = 15
    } else if (kind === KIND_CRIT) {
      tint = T.accentCrit
      size = 22
    } else if (v >= HUGE_HIT) {
      tint = T.rarityEvolution
      size = 18
    } else if (v >= BIG_HIT) {
      tint = T.accentCrit
      size = 15
    } else {
      tint = T.textHi
      size = 13
    }
    const row = this.glyphs[i]!
    layoutGlyphs(row, c, n, 0.5)
    for (let j = 0; j < GLYPHS; j++) setTint(row[j]!, tint)
    this.size[i] = size
    this.life[i] = kind === KIND_CRIT ? CRIT_LIFE_MS : LIFE_MS
  }
}
