import { Container, type Texture } from 'pixi.js'
import { ENEMY_EMERGE, FIXED_DT } from '../config.ts'
import type { ArenaTheme } from '../content/arenas.ts'
import { hash32 } from '../core/rng.ts'
import type { World } from '../game/world.ts'
import { doubleFields } from '../core/fields.ts'
import { Quad, QuadLayer, packColor } from './quads.ts'
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
 * Parts are quads refilled each frame, normal parts first, then additive ones.
 */
export class EmergeFx {
  readonly view = new Container()
  /** Effects started and arrivals dropped for a full pool, since the last reset. */
  started = 0
  dropped = 0
  /** Uids that got an effect in the last scan (the ringview probe reads them). */
  readonly lastUids = new Int32Array(CAP)
  lastN = 0
  private readonly normal = new QuadLayer()
  private readonly add = new QuadLayer('add')
  private readonly live = new Uint8Array(CAP)
  private readonly born = new Float64Array(CAP)
  private readonly seed = new Uint32Array(CAP)
  private readonly size = new Float32Array(CAP)
  private readonly x = new Float64Array(CAP)
  private readonly y = new Float64Array(CAP)
  /** Per part of the current style: frame, origin anchor, additive blend. */
  private readonly partTex: Texture[] = []
  private readonly partAx = new Float32Array(PARTS)
  private readonly partAy = new Float32Array(PARTS)
  private readonly partAdd = new Uint8Array(PARTS)
  private style = STYLE_TEAR
  private colorA = 0xffffff
  private colorB = 0xffffff
  private seenSeq = 1
  // The next part's look, passed in fields: doubles passed as arguments to a
  // call that is not inlined are boxed.
  private px = 0
  private py = 0
  private pRot = 0
  private pSx = 0
  private pSy = 0
  private pTint = 0
  private pA = 0

  constructor(private readonly texReg: TextureRegistry) {
    this.view.addChild(this.normal.view, this.add.view)
    for (let j = 0; j < PARTS; j++) this.partTex.push(texReg.getTexture('particle'))
    this.normal.reserve(CAP * PARTS, this.partTex[0]!)
    this.add.reserve(CAP * PARTS, this.partTex[0]!)
    doubleFields(this)
  }

  setTheme(theme: ArenaTheme): void {
    this.style = STYLE_OF[theme.id] ?? STYLE_TEAR
    // Tear: acid slit and shards on a violet membrane. Plume: pale bubbles over
    // a glow disc. Embers: orange and yellow sparks around a hot ring.
    this.colorA = this.style === STYLE_PLUME ? theme.atmosphere.color : theme.hazardTint
    this.colorB = this.style === STYLE_TEAR ? theme.ichorB : this.style === STYLE_PLUME ? theme.borderGlow : theme.atmosphere.color2
    const keys = PART_KEYS[this.style]!
    const probe = new Quad(this.partTex[0]!)
    for (let j = 0; j < PARTS; j++) {
      this.texReg.applyQuad(probe, keys[j]!)
      this.partTex[j] = probe.texture
      this.partAx[j] = probe.anchorX
      this.partAy[j] = probe.anchorY
      this.partAdd[j] = this.style === STYLE_EMBER && j > 0 ? 1 : 0
    }
  }

  /** Fresh run: forget every effect and skip the uids of the run before. */
  reset(world: World): void {
    this.live.fill(0)
    this.normal.begin()
    this.normal.end()
    this.add.begin()
    this.add.end()
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
      this.x[slot] = e.x
      this.y[slot] = e.y
      // Shown this frame, after the ones update() drew.
      const k = (world.time - e.bornAt) / ENEMY_EMERGE
      this.draw(slot, k < 0 ? 0 : k > 1 ? 1 : k)
      this.started++
      if (this.lastN < CAP) this.lastUids[this.lastN++] = e.uid
    }
    this.normal.end()
    this.add.end()
  }

  /** Every render frame; `alpha` interpolates sim time like the entities. */
  update(world: World, alpha: number): void {
    const t = world.time + alpha * FIXED_DT
    this.normal.begin()
    this.add.begin()
    for (let i = 0; i < CAP; i++) {
      if (!this.live[i]) continue
      const k = (t - this.born[i]!) / ENEMY_EMERGE
      if (k >= 1 || k < -0.05) {
        this.live[i] = 0
        continue
      }
      this.draw(i, k < 0 ? 0 : k)
    }
    this.normal.end()
    this.add.end()
  }

  /** Sets the next part's local offset from its spawn point, rotation, scale, tint and alpha. */
  private look(lx: number, ly: number, rot: number, sx: number, sy: number, tint: number, a: number): void {
    this.px = lx
    this.py = ly
    this.pRot = rot
    this.pSx = sx
    this.pSy = sy
    this.pTint = tint
    this.pA = a
  }

  /** Part `j` of effect `i`, in the look last set. */
  private part(i: number, j: number): void {
    const tex = this.partTex[j]!
    const q = this.partAdd[j] ? this.add.next(tex) : this.normal.next(tex)
    q.texture = tex
    q.anchorX = this.partAx[j]!
    q.anchorY = this.partAy[j]!
    q.x = this.x[i]! + this.px
    q.y = this.y[i]! + this.py
    q.rotation = this.pRot
    q.scaleX = this.pSx
    q.scaleY = this.pSy
    q.color = packColor(this.pTint, this.pA)
  }

  private draw(i: number, k: number): void {
    const r = this.size[i]!
    const h = this.seed[i]!
    const u = 1 - k
    const ease = 1 - u * u
    const turn = ((h & 0xffff) / 0x10000) * TAU
    if (this.style === STYLE_TEAR) {
      const ds = ((r * (0.7 + 0.9 * ease)) / HZ_TEX.discR) * 1.2
      this.look(0, 0, 0, ds, ds, this.colorB, 0.55 * u)
      this.part(i, 0)
      this.look(0, 0, turn, r / 9, 0.25 + 1.6 * ease, this.colorA, k < 0.7 ? 1 : (1 - k) / 0.3)
      this.part(i, 1)
      for (let j = 2; j < PARTS; j++) {
        const a = turn + Math.PI / 2 + (j - 2) * (Math.PI / 2) + (((h >>> (j * 3)) & 7) - 3.5) * 0.12
        const d = r * (0.3 + 1.6 * ease)
        const sc = 1.1 * u + 0.4
        this.look(Math.cos(a) * d, Math.sin(a) * d, a + k * 6, sc, sc, this.colorA, u)
        this.part(i, j)
      }
    } else if (this.style === STYLE_PLUME) {
      const ds = (r * (0.7 + 0.9 * ease)) / HZ_TEX.discR
      this.look(0, 0, 0, ds, ds, this.colorB, 0.7 * u)
      this.part(i, 0)
      for (let j = 1; j < PARTS; j++) {
        const hj = (h >>> (j * 4)) & 15
        const lag = (j - 1) * 0.07
        const kj = k < lag ? 0 : (k - lag) / (1 - lag)
        const x0 = (hj / 15 - 0.5) * r * 1.6
        const sc = 0.2 + 0.014 * hj + 0.1 * kj
        this.look(x0 + Math.sin(kj * 9 + hj) * 5, -kj * (r * 1.6 + 30 + hj * 2), 0, sc, sc, this.colorA, kj > 0 ? 1 - kj * kj : 0)
        this.part(i, j)
      }
    } else {
      const rs = (r * (0.4 + 1.2 * ease)) / 28
      this.look(0, 0, 0, rs, rs, this.colorB, 0.8 * u * u)
      this.part(i, 0)
      for (let j = 1; j < PARTS; j++) {
        const a = turn + (j - 1) * (TAU / 5) + (((h >>> (j * 3)) & 7) - 3.5) * 0.1
        const d = r * 0.3 + (r * 1.2 + 26) * ease
        const sc = 0.9 * u + 0.3
        this.look(Math.cos(a) * d, Math.sin(a) * d - 22 * k * k, 0, sc, sc, j & 1 ? this.colorA : this.colorB, u)
        this.part(i, j)
      }
    }
  }
}
