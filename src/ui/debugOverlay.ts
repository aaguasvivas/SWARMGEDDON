import { Container, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Insets } from '../platform/safeArea.ts'

export interface DebugInfo {
  fps: number
  frameMs: number
  p95: number
  maxMs: number
  longFrames: number
  badFrames: number
  totalFrames: number
  steps: number
  enemies: number
  projectiles: number
  particles: number
  inputType: string
  firing: boolean
  width: number
  height: number
  dpr: number
  seed: number
}

/**
 * Top-left diagnostics overlay: FPS, frame time, sim steps/frame, entity count,
 * active input device, resolution/DPR, and the run seed. Toggle with backtick.
 * This is the eyes-on instrument we tune the hot loop against in later phases.
 */
export class DebugOverlay {
  readonly view = new Container()
  private text: Text

  constructor() {
    this.text = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 16,
        fill: COLORS.hudText,
        dropShadow: { color: 0x000000, blur: 0, distance: 1, angle: Math.PI / 4, alpha: 0.9 },
      },
    })
    this.view.addChild(this.text)
    // Hidden by default — it's a dev instrument, not player UI (it used to ship
    // visible and crowd the HUD). Press backtick to bring it up.
    this.view.visible = false
  }

  layout(insets: Insets): void {
    this.view.position.set(insets.left + 10, insets.top + 8)
  }

  toggle(): void {
    this.view.visible = !this.view.visible
  }

  update(info: DebugInfo): void {
    if (!this.view.visible) return
    const low = info.fps > 0 && info.fps < 55 ? '  ⚠ LOW' : ''
    const ents = info.enemies + info.projectiles + info.particles
    this.text.text =
      `SWARMGEDDON · phase 3\n` +
      `fps   ${info.fps.toFixed(0).padStart(3)}${low}\n` +
      `frame ${info.frameMs.toFixed(1)}ms · steps ${info.steps}\n` +
      `p95   ${info.p95.toFixed(1)}ms · max ${info.maxMs.toFixed(0)} · long ${info.longFrames}/${info.totalFrames}${info.badFrames > 0 ? ` · BAD ${info.badFrames}` : ''}\n` +
      `ents  ${ents}  (e${info.enemies} p${info.projectiles} fx${info.particles})\n` +
      `input ${info.inputType}${info.firing ? ' · FIRE' : ''}\n` +
      `view  ${info.width}×${info.height} @${info.dpr.toFixed(2)}x\n` +
      `seed  ${info.seed >>> 0}\n` +
      `[\`] debug  [r] restart`
  }
}
