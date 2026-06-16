import { Container, Graphics, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { Settings } from '../state/settings.ts'
import { Button, Slider } from './button.ts'

const MONO = 'ui-monospace, Menlo, Consolas, monospace'

interface Row {
  key: 'master' | 'sfx' | 'music' | 'shake' | 'ichor' | 'glow'
  label: Text
  value: Text
  slider: Slider
  scale: number // setting = sliderValue * scale
}

/** Settings overlay: volume/shake/ichor sliders + haptics toggle. Emits the
 *  full Settings object on every change so the caller can apply + persist. */
export class SettingsPanel {
  readonly view = new Container()
  onChange: (s: Settings) => void = () => {}
  onClose: () => void = () => {}

  private backdrop = new Graphics()
  private title: Text
  private rows: Row[] = []
  private autofire: Button
  private haptics: Button
  private back: Button
  private settings!: Settings
  private w = 0
  private h = 0

  constructor() {
    this.view.addChild(this.backdrop) // index 0 (drawn each relayout)
    this.title = new Text({ text: 'SETTINGS', style: { fontFamily: MONO, fontSize: 30, fontWeight: 'bold', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0.5)

    this.rows = (
      [
        ['master', 'Master', 1],
        ['sfx', 'SFX', 1],
        ['music', 'Music', 1],
        ['shake', 'Screen Shake', 1.5],
        ['ichor', 'Ichor', 1.5],
        ['glow', 'Glow', 1.5],
      ] as const
    ).map(([key, name, scale]) => {
      const label = new Text({ text: name, style: { fontFamily: MONO, fontSize: 14, fill: COLORS.hudText } })
      const value = new Text({ text: '', style: { fontFamily: MONO, fontSize: 13, fill: COLORS.hudDim } })
      value.anchor.set(1, 0)
      const slider = new Slider(220)
      slider.onChange = (v) => {
        this.settings[key] = v * scale
        this.refreshValues()
        this.emit()
      }
      this.view.addChild(label, value, slider.view)
      return { key, label, value, slider, scale }
    })

    this.autofire = new Button('AUTO-FIRE: ON', 220, 40, COLORS.hudDim, 14)
    this.autofire.onClick = () => {
      this.settings.autoFire = !this.settings.autoFire
      this.autofire.setText(`AUTO-FIRE: ${this.settings.autoFire ? 'ON' : 'OFF'}`)
      this.emit()
    }
    this.haptics = new Button('HAPTICS: ON', 220, 40, COLORS.hudDim, 14)
    this.haptics.onClick = () => {
      this.settings.haptics = !this.settings.haptics
      this.haptics.setText(`HAPTICS: ${this.settings.haptics ? 'ON' : 'OFF'}`)
      this.emit()
    }
    this.back = new Button('BACK', 220, 48, COLORS.player)
    this.back.onClick = () => this.onClose()

    this.view.addChild(this.title, this.autofire.view, this.haptics.view, this.back.view)
    this.view.visible = false
  }

  open(settings: Settings): void {
    this.settings = { ...settings }
    for (const r of this.rows) r.slider.set(this.settings[r.key] / r.scale)
    this.autofire.setText(`AUTO-FIRE: ${this.settings.autoFire ? 'ON' : 'OFF'}`)
    this.haptics.setText(`HAPTICS: ${this.settings.haptics ? 'ON' : 'OFF'}`)
    this.refreshValues()
    this.relayout()
    this.view.visible = true
  }

  hide(): void {
    this.view.visible = false
  }

  layout(w: number, h: number): void {
    this.w = w
    this.h = h
    if (this.view.visible) this.relayout()
  }

  private refreshValues(): void {
    for (const r of this.rows) r.value.text = `${Math.round((this.settings[r.key] / r.scale) * 100)}%`
  }

  private emit(): void {
    this.onChange({ ...this.settings })
  }

  private relayout(): void {
    const { w, h } = this
    this.backdrop.clear()
    this.backdrop.rect(0, 0, w, h).fill({ color: 0x05070d, alpha: 0.82 })
    const cx = w / 2
    const left = cx - 110
    let y = h * 0.5 - 215
    this.title.position.set(cx, y)
    y += 44
    for (const r of this.rows) {
      r.label.position.set(left, y)
      r.value.position.set(left + 220, y)
      r.slider.view.position.set(left, y + 24)
      y += 46
    }
    y += 2
    this.autofire.position(left, y)
    y += 48
    this.haptics.position(left, y)
    y += 50
    this.back.position(left, y)
  }
}
