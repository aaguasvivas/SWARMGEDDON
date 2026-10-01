import {
  Color, GlProgram, GpuProgram, Matrix, ParticleContainer, Rectangle, Shader, Texture, TextureStyle, particlesFrag, particlesVert, particlesWgsl,
  type IParticle,
} from 'pixi.js'
import { doubleFields } from '../core/fields.ts'

/** Pixi's particle color for an 0xRRGGBB tint and an alpha: BGR in the low
 *  bytes, alpha in the top byte (the same packing a Sprite's tint and alpha get). */
export function packColor(tint: number, alpha: number): number {
  const bgr = ((tint & 0xff) << 16) | (tint & 0xff00) | ((tint >> 16) & 0xff)
  const a = alpha <= 0 ? 0 : alpha >= 1 ? 1 : alpha
  return bgr + (((a * 255) | 0) << 24)
}

/**
 * One textured quad of a QuadLayer: the fields Pixi's ParticleContainer reads,
 * plus the look the sim records at spawn (tint, alpha), which the renderer
 * packs into `color`. Plain fields of one class, so writing them per frame
 * goes through no Pixi setter and boxes nothing.
 */
export class Quad implements IParticle {
  x = 0
  y = 0
  scaleX = 0
  scaleY = 0
  anchorX = 0.5
  anchorY = 0.5
  rotation = 0
  color = 0
  tint = 0xffffff
  alpha = 1

  constructor(public texture: Texture) {
    // `color` past half alpha is outside the small-integer range: settle every
    // number field as a double before the first frame does.
    doubleFields(this)
  }

  /** A dead pool entry keeps its slot: zero size and alpha draw nothing. */
  hide(): void {
    this.scaleX = 0
    this.scaleY = 0
    this.color = 0
  }

  /** Packs the recorded tint and alpha into `color`. */
  paint(): void {
    this.color = packColor(this.tint, this.alpha)
  }
}

/** The list a ParticleContainer draws: `length` is set per frame without
 *  resizing an array (shrinking an array frees its store in V8). */
class QuadList {
  length = 0;
  [i: number]: Quad
}

const BOUNDS = new Rectangle(-1e6, -1e6, 2e6, 2e6)

/** Pixi's particle shader, one instance per layer: with the shared default
 *  instance, each layer drawn from another texture than the last rebinds it,
 *  which allocates listener records every frame. */
function particleShader(): Shader {
  return new Shader({
    glProgram: GlProgram.from({ vertex: particlesVert, fragment: particlesFrag }),
    gpuProgram: GpuProgram.from({
      fragment: { source: particlesWgsl, entryPoint: 'mainFragment' },
      vertex: { source: particlesWgsl, entryPoint: 'mainVertex' },
    }),
    resources: {
      uTexture: Texture.WHITE.source,
      uSampler: new TextureStyle({}),
      uniforms: {
        uTranslationMatrix: { value: new Matrix(), type: 'mat3x3<f32>' },
        uColor: { value: new Color(0xffffff), type: 'vec4<f32>' },
        uRound: { value: 1, type: 'f32' },
        uResolution: { value: [0, 0], type: 'vec2<f32>' },
      },
    },
  })
}

/**
 * A ParticleContainer of Quads on one texture source (section 3.2). Every
 * property is re-uploaded each frame, nothing is a scene-graph child, and no
 * quad is ever hidden through `visible`, so the per-sprite transform update
 * and the draw-list rebuild a shown or hidden pooled sprite costs are gone.
 *
 * Two uses: pool entries `add()` their own quad once and keep that slot (a
 * stable draw order, hidden with `Quad.hide()`), or a renderer refills the
 * layer each frame with `begin()`, `next()` and `end()`.
 */
export class QuadLayer {
  readonly view: ParticleContainer
  private readonly list = new QuadList()
  private readonly own: Quad[] = []
  private n = 0

  constructor(blend: 'normal' | 'add' = 'normal') {
    this.view = new ParticleContainer({
      dynamicProperties: { position: true, rotation: true, vertex: true, uvs: true, color: true },
      shader: particleShader(),
    })
    this.view.boundsArea = BOUNDS
    this.view.blendMode = blend
    this.view.particleChildren = this.list as unknown as IParticle[]
    // Pixi compiles the upload loop with new Function (sloppy mode), and its
    // code assigns `offset` and the vertex corners without declaring them: as
    // implicit globals every corner is boxed, four doubles per quad per frame.
    // A `var` anywhere in the body makes them locals.
    const props = (this.view as unknown as { _properties: Record<string, { code: string }> })._properties
    props.vertex!.code = 'var offset, w0, w1, h0, h1;\n' + props.vertex!.code
  }

  /** A pool entry's own quad, drawn in the order added. */
  add(q: Quad): void {
    this.list[this.list.length++] = q
  }

  /** Makes `n` quads up front, so refilling never grows the layer mid-run. */
  reserve(n: number, texture: Texture): void {
    for (let i = this.own.length; i < n; i++) {
      const q = new Quad(texture)
      this.own.push(q)
      this.list[i] = q
    }
  }

  begin(): void {
    this.n = 0
  }

  /** The next quad to fill this frame, made on first use. */
  next(texture: Texture): Quad {
    let q = this.own[this.n]
    if (q === undefined) {
      q = new Quad(texture)
      this.own.push(q)
      this.list[this.n] = q
    }
    this.n++
    return q
  }

  end(): void {
    this.list.length = this.n
  }
}
