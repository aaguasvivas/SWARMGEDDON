/**
 * Fixed-timestep game loop with an accumulator and render interpolation.
 *
 * Why: the simulation must advance in equal-sized steps for determinism (daily
 * seeds) and stable physics/collision, but displays refresh at wildly different
 * rates (60/90/120/144Hz, plus throttling). We decouple the two:
 *
 *   - `onUpdate(dt)` runs 0..N times per frame, always with the SAME dt, until
 *     the accumulator drains. Game state only ever changes here.
 *   - `onRender(alpha)` runs exactly once per frame. `alpha` in [0,1) is how far
 *     we are between the last two sim steps, so renderers can interpolate
 *     (prev -> current) for smooth motion that doesn't judder against refresh.
 *
 * The accumulator is clamped (maxFrameTime) so a long stall can't queue seconds
 * of catch-up steps and lock the tab — the classic "spiral of death".
 */
export class GameLoop {
  /** Smoothed frames-per-second, refreshed ~2x/sec. For the debug overlay. */
  fps = 0
  /** Wall-clock duration of the most recent rAF frame, in milliseconds. */
  frameMs = 0
  /** Number of sim steps executed on the most recent frame (0..N). */
  steps = 0

  private accumulator = 0
  private lastTime = 0
  private running = false
  private rafId = 0

  private fpsTimer = 0
  private fpsFrames = 0

  constructor(
    private readonly fixedDt: number,
    private readonly maxFrameTime: number,
    private readonly onUpdate: (dt: number) => void,
    private readonly onRender: (alpha: number) => void,
  ) {}

  start(): void {
    if (this.running) return
    this.running = true
    this.lastTime = performance.now() / 1000
    this.accumulator = 0
    this.rafId = requestAnimationFrame(this.tick)
  }

  stop(): void {
    this.running = false
    cancelAnimationFrame(this.rafId)
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return
    const now = nowMs / 1000
    let frame = now - this.lastTime
    this.lastTime = now

    // Clamp the frame delta before it ever reaches the accumulator.
    if (frame > this.maxFrameTime) frame = this.maxFrameTime
    if (frame < 0) frame = 0
    this.frameMs = frame * 1000

    this.accumulator += frame
    let steps = 0
    while (this.accumulator >= this.fixedDt) {
      this.onUpdate(this.fixedDt)
      this.accumulator -= this.fixedDt
      steps++
    }
    this.steps = steps

    // alpha: fractional progress toward the next (not-yet-run) sim step.
    const alpha = this.accumulator / this.fixedDt
    this.onRender(alpha)

    // FPS smoothing over a ~0.5s window.
    this.fpsTimer += frame
    this.fpsFrames++
    if (this.fpsTimer >= 0.5) {
      this.fps = this.fpsFrames / this.fpsTimer
      this.fpsTimer = 0
      this.fpsFrames = 0
    }

    this.rafId = requestAnimationFrame(this.tick)
  }
}
