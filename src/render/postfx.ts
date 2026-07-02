import { ColorMatrixFilter, type Container } from 'pixi.js'
import { AdvancedBloomFilter } from 'pixi-filters'

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
    this.grade.saturate(0.16, true)
    this.grade.contrast(0.05, true)

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

  private apply(): void {
    this.target.filters = this.intensity > 0.02 ? [this.grade, this.bloom] : []
  }
}
