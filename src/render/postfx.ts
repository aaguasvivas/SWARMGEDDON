import { ColorMatrixFilter, type Container } from 'pixi.js'
import { AdvancedBloomFilter } from 'pixi-filters'
import { lerpHex } from '../core/color.ts'

/** Per-world color grade knobs (added ON TOP of the base saturate/contrast). */
export interface GradeSpec {
  tint: number
  tintStrength: number
  saturation: number
  contrast: number
  brightness: number
}

const BASE_SATURATE = 0.16
const BASE_CONTRAST = 0.05

/**
 * Post-processing for the game world: a threshold bloom (so only the bright
 * neon — player, bullets, sparks, gems, ichor — glows, while the dark floor
 * stays clean) plus a subtle saturation/contrast grade so the palette pops.
 *
 * Bloom is multi-pass, so the `setIntensity(0)` path removes ALL filters — a
 * true off-switch for low-end devices, exposed via the Glow setting. Applied to
 * the screen-space `scene` container (an identity child of the stage, ABOVE the
 * camera/shake/warp translate), so the bloom processes exactly the visible window
 * and its filterArea is never dragged off-screen by the camera.
 */
export class PostFX {
  private readonly bloom: AdvancedBloomFilter
  private readonly grade: ColorMatrixFilter
  private intensity = 1

  constructor(private readonly target: Container) {
    this.grade = new ColorMatrixFilter()
    this.grade.saturate(BASE_SATURATE, true)
    this.grade.contrast(BASE_CONTRAST, true)

    this.bloom = new AdvancedBloomFilter({
      threshold: 0.42, // only pixels brighter than this bloom
      bloomScale: 1,
      brightness: 1,
      blur: 5,
      quality: 3,
    })
    // IMPORTANT: a filter's `resolution` is NOT just its own passes — Pixi takes
    // the MIN across the whole filter chain when it flattens the scene into the
    // input texture, so a 0.5 here rendered the ENTIRE world at half resolution
    // (blurry map, crisp UI — audit finding). Keep both filters at 1 (CSS-pixel
    // capture, sharp at normal viewing) as the perf/quality floor; full-DPR
    // capture is a measured Phase-1 decision (4x the bloom fill on retina).
    this.grade.resolution = 1
    this.bloom.resolution = 1

    this.apply()
  }

  /** 0 = off (no filters); ~1 = default; up to ~1.6 for a heavy neon haze. */
  setIntensity(v: number): void {
    this.intensity = v
    this.bloom.bloomScale = v
    this.apply()
  }

  /**
   * Per-world color grade. Composed ONLY through the accumulating helpers
   * (`saturate`/`contrast`/`brightness`/`tint` with multiply=true) so each step
   * multiplies onto the running matrix — assigning `.matrix` directly would
   * silently discard the saturate/contrast. `tint` is a uniform color multiply,
   * so partial strength is done by pre-lerping the tint toward white.
   */
  setGrade(g: GradeSpec): void {
    this.grade.reset()
    this.grade.saturate(BASE_SATURATE + g.saturation, true)
    this.grade.contrast(BASE_CONTRAST + g.contrast, true)
    if (g.brightness !== 0) this.grade.brightness(1 + g.brightness, true)
    if (g.tintStrength > 0) this.grade.tint(lerpHex(0xffffff, g.tint, g.tintStrength), true)
  }

  private apply(): void {
    this.target.filters = this.intensity > 0.02 ? [this.grade, this.bloom] : []
  }
}
