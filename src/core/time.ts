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
  /** CLAMPED duration of the most recent rAF frame, in ms (feeds UI fades). */
  frameMs = 0
  /** Number of sim steps executed on the most recent frame (0..N). */
  steps = 0

  // --- frame-time stats (Phase-1 instrument): raw, unclamped wall time -------
  /** Frames > 20ms (a real missed 60Hz frame, past rAF jitter) since resetStats(). */
  longFrames = 0
  /** Frames > 33.4ms (missed 30Hz — a visible hitch) since the last resetStats(). */
  badFrames = 0
  /** Total frames observed since the last resetStats(). */
  totalFrames = 0
  /** Worst raw frame (ms) since the last resetStats(). */
  maxMs = 0
  private samples = new Float32Array(240) // ~4s ring at 60fps
  private sampleIdx = 0
  private sampleCount = 0

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

  /** Reset the frame-time stats window (e.g. right before a measurement run). */
  resetStats(): void {
    this.longFrames = 0
    this.badFrames = 0
    this.totalFrames = 0
    this.maxMs = 0
    this.sampleIdx = 0
    this.sampleCount = 0
  }

  /** 95th-percentile raw frame time (ms) over the recent sample ring. */
  p95(): number {
    const n = this.sampleCount
    if (n === 0) return 0
    const sorted = Array.from(this.samples.subarray(0, n)).sort((a, b) => a - b)
    return sorted[Math.min(n - 1, Math.floor(n * 0.95))]!
  }

  private tick = (nowMs: number): void => {
    if (!this.running) return
    const now = nowMs / 1000
    let frame = now - this.lastTime
    this.lastTime = now

    // Record RAW wall time for the stats (the clamp below hides real stalls).
    // Frames > 500ms are a backgrounded/suspended tab, not gameplay — skip them.
    const rawMs = frame * 1000
    if (rawMs > 0 && rawMs <= 500) {
      this.samples[this.sampleIdx] = rawMs
      this.sampleIdx = (this.sampleIdx + 1) % this.samples.length
      if (this.sampleCount < this.samples.length) this.sampleCount++
      this.totalFrames++
      if (rawMs > 20) this.longFrames++
      if (rawMs > 33.4) this.badFrames++
      if (rawMs > this.maxMs) this.maxMs = rawMs
    }

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
