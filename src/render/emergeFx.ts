import { Container, type Sprite } from 'pixi.js'
import { ENEMY_EMERGE, FIXED_DT } from '../config.ts'
import type { ArenaTheme } from '../content/arenas.ts'
import { hash32 } from '../core/rng.ts'
import type { World } from '../game/world.ts'
import { HZ_TEX, type TextureRegistry } from './textures.ts'

const CAP = 64
const PARTS = 6
/** How far outside the view an arrival still gets its effect (world units). */
const VIEW_PAD = 24
const STYLE_TEAR = 0
const STYLE_PLUME = 1
const STYLE_EMBER = 2
const TAU = Math.PI * 2

/** Per-world look: the Hive tears a membrane, the Depths lift a bubble plume,
 *  the Wastes throw an ember burst. */
const STYLE_OF: Readonly<Record<string, number>> = { hive: STYLE_TEAR, depths: STYLE_PLUME, wastes: STYLE_EMBER }
const PART_KEYS: readonly (readonly string[])[] = [
  ['hzDisc', 'flash', 'gib', 'gib', 'gib', 'gib'],
  ['hzDisc', 'ring', 'ring', 'ring', 'ring', 'ring'],
  ['ring', 'particle', 'particle', 'particle', 'particle', 'particle'],
]

/**
 * The emerge effect (decision 6): an arrival that lands inside the view comes
 * out of a world-themed effect timed to the ENEMY_EMERGE fade, never popping
 * in. Render only: it reads new enemies by uid and sim time, keeps its own
 * pool, and draws per-effect variety from a hash of the uid (no sim stream).
 */
export class EmergeFx {
  readonly view = new Container()
  /** Effects started and arrivals dropped for a full pool, since the last reset. */
  started = 0
  dropped = 0
  /** Uids that got an effect in the last scan (the ringview probe reads them). */
  readonly lastUids = new Int32Array(CAP)
  lastN = 0
  private readonly boxes: Container[] = []
  private readonly parts: Sprite[][] = []
  private readonly live = new Uint8Array(CAP)
  private readonly born = new Float64Array(CAP)
  private readonly seed = new Uint32Array(CAP)
  private readonly size = new Float32Array(CAP)
  private style = STYLE_TEAR
  private colorA = 0xffffff
  private colorB = 0xffffff
  private seenSeq = 1

  constructor(private readonly texReg: TextureRegistry) {
    for (let i = 0; i < CAP; i++) {
      const box = new Container()
      box.visible = false
      const row: Sprite[] = []
      for (let j = 0; j < PARTS; j++) {
        const s = texReg.makeSprite('particle')
        s.visible = true
        row.push(s)
        box.addChild(s)
      }
      this.boxes.push(box)
      this.parts.push(row)
      this.view.addChild(box)
    }
  }

  setTheme(theme: ArenaTheme): void {
    this.style = STYLE_OF[theme.id] ?? STYLE_TEAR
    // Tear: acid slit and shards on a violet membrane. Plume: pale bubbles over
    // a glow disc. Embers: orange and yellow sparks around a hot ring.
    this.colorA = this.style === STYLE_PLUME ? theme.atmosphere.color : theme.hazardTint
    this.colorB = this.style === STYLE_TEAR ? theme.ichorB : this.style === STYLE_PLUME ? theme.borderGlow : theme.atmosphere.color2
    const keys = PART_KEYS[this.style]!
    for (let i = 0; i < CAP; i++) {
      const row = this.parts[i]!
      for (let j = 0; j < PARTS; j++) {
        this.texReg.applySprite(row[j]!, keys[j]!)
        row[j]!.blendMode = this.style === STYLE_EMBER && j > 0 ? 'add' : 'normal'
      }
    }
  }

  /** Fresh run: forget every effect and skip the uids of the run before. */
  reset(world: World): void {
    this.live.fill(0)
    for (const b of this.boxes) b.visible = false
    this.seenSeq = world.enemyUidSeq
    this.started = 0
    this.dropped = 0
    this.lastN = 0
  }

  /** Give every enemy spawned since the last scan whose body touches the view
   *  (world rect vx, vy, vw, vh) its effect. Bosses have their own entrance. */
  scan(world: World, vx: number, vy: number, vw: number, vh: number): void {
    this.lastN = 0
    const seq = world.enemyUidSeq
    if (seq === this.seenSeq) return
    const from = this.seenSeq
    this.seenSeq = seq
    const es = world.enemies.active
    for (let i = 0; i < es.length; i++) {
      const e = es[i]!
      if (e.uid < from || !e.alive || e.def.boss) continue
      const r = e.radius + VIEW_PAD
      if (e.x + r < vx || e.x - r > vx + vw || e.y + r < vy || e.y - r > vy + vh) continue
      let slot = -1
      for (let k = 0; k < CAP; k++) {
        if (!this.live[k]) {
          slot = k
          break
        }
      }
      if (slot < 0) {
        this.dropped++
        continue
      }
      this.live[slot] = 1
      this.born[slot] = e.bornAt
      this.seed[slot] = hash32(e.uid, 0x3e11e)
      this.size[slot] = e.radius
      const box = this.boxes[slot]!
      box.position.set(e.x, e.y)
      box.visible = true
      const k = (world.time - e.bornAt) / ENEMY_EMERGE
      this.draw(slot, k < 0 ? 0 : k > 1 ? 1 : k)
      this.started++
      if (this.lastN < CAP) this.lastUids[this.lastN++] = e.uid
    }
  }

  /** Every render frame; `alpha` interpolates sim time like the entities. */
  update(world: World, alpha: number): void {
    const t = world.time + alpha * FIXED_DT
    for (let i = 0; i < CAP; i++) {
      if (!this.live[i]) continue
      const k = (t - this.born[i]!) / ENEMY_EMERGE
      if (k >= 1 || k < -0.05) {
        this.live[i] = 0
        this.boxes[i]!.visible = false
        continue
      }
      this.draw(i, k < 0 ? 0 : k)
    }
  }

  private draw(i: number, k: number): void {
    const row = this.parts[i]!
    const r = this.size[i]!
    const h = this.seed[i]!
    const u = 1 - k
    const ease = 1 - u * u
    const turn = ((h & 0xffff) / 0x10000) * TAU
    if (this.style === STYLE_TEAR) {
      const disc = row[0]!
      disc.tint = this.colorB
      disc.alpha = 0.55 * u
      disc.scale.set(((r * (0.7 + 0.9 * ease)) / HZ_TEX.discR) * 1.2)
      const slit = row[1]!
      slit.tint = this.colorA
      slit.rotation = turn
      slit.alpha = k < 0.7 ? 1 : (1 - k) / 0.3
      slit.scale.set(r / 9, 0.25 + 1.6 * ease)
      for (let j = 2; j < PARTS; j++) {
        const s = row[j]!
        const a = turn + Math.PI / 2 + (j - 2) * (Math.PI / 2) + (((h >>> (j * 3)) & 7) - 3.5) * 0.12
        const d = r * (0.3 + 1.6 * ease)
        s.position.set(Math.cos(a) * d, Math.sin(a) * d)
        s.rotation = a + k * 6
        s.tint = this.colorA
        s.alpha = u
        s.scale.set(1.1 * u + 0.4)
      }
    } else if (this.style === STYLE_PLUME) {
      const disc = row[0]!
      disc.tint = this.colorB
      disc.alpha = 0.7 * u
      disc.scale.set((r * (0.7 + 0.9 * ease)) / HZ_TEX.discR)
      for (let j = 1; j < PARTS; j++) {
        const s = row[j]!
        const hj = (h >>> (j * 4)) & 15
        const lag = (j - 1) * 0.07
        const kj = k < lag ? 0 : (k - lag) / (1 - lag)
        const x0 = (hj / 15 - 0.5) * r * 1.6
        s.position.set(x0 + Math.sin(kj * 9 + hj) * 5, -kj * (r * 1.6 + 30 + hj * 2))
        s.tint = this.colorA
        s.alpha = kj > 0 ? 1 - kj * kj : 0
        s.scale.set(0.2 + 0.014 * hj + 0.1 * kj)
      }
    } else {
      const ring = row[0]!
      ring.tint = this.colorB
      ring.alpha = 0.8 * u * u
      ring.scale.set((r * (0.4 + 1.2 * ease)) / 28)
      for (let j = 1; j < PARTS; j++) {
        const s = row[j]!
        const a = turn + (j - 1) * (TAU / 5) + (((h >>> (j * 3)) & 7) - 3.5) * 0.1
        const d = r * 0.3 + (r * 1.2 + 26) * ease
        s.position.set(Math.cos(a) * d, Math.sin(a) * d - 22 * k * k)
        s.tint = j & 1 ? this.colorA : this.colorB
        s.alpha = u
        s.scale.set(0.9 * u + 0.3)
      }
    }
  }
}
