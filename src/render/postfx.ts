import { ColorMatrixFilter, type Container } from 'pixi.js'
import { AdvancedBloomFilter } from 'pixi-filters'

/**
 * Post-processing for the game world: a threshold bloom (so only the bright
 * neon — player, bullets, sparks, gems, ichor — glows, while the dark floor
 * stays clean) plus a subtle saturation/contrast grade so the palette pops.
 *
 * Bloom is multi-pass, so the `setIntensity(0)` path removes ALL filters — a
 * true off-switch for low-end devices, exposed via the Glow setting. Applied to
 * the shakeable/warpable `world` container; the container's own transform is
 * applied after the filter, so shake + reality-warp still work.
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
    // Render the bloom at half resolution — the glow is soft so it's visually
    // indistinguishable, but the multi-pass blur costs ~1/4 the fill rate. This
    // is what keeps a full-screen bloom affordable at 500+ enemies on mobile.
    this.bloom.resolution = 0.5

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
