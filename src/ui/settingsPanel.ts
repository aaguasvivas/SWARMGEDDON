import { Container, Graphics, Rectangle, Text } from 'pixi.js'
import { COLORS } from '../config.ts'
import type { DamageNumberMode } from '../effects/damageNumbers.ts'
import type { Insets } from '../platform/safeArea.ts'
import { DEFAULT_SETTINGS, type Settings } from '../state/settings.ts'
import { Button, Segmented, Slider, Toggle } from './button.ts'
import { IconButton } from './iconButton.ts'
import { ScrollView, type ScrollRow } from './scroll.ts'
import type { ToastSlot } from './toast.ts'
import { FONT, T, TARGET, uiScale } from './tokens.ts'

const TABS = ['AUDIO', 'VISUALS', 'CONTROLS', 'ACCOUNT'] as const
const COL_MAX = 420
const ROW_GAP = 4
const SLIDER_H = 56
const TOGGLE_H = 52
const SEG_ROW_H = 74
const DAMAGE_MODES: readonly DamageNumberMode[] = ['all', 'big', 'off']

type SliderKey = 'master' | 'sfx' | 'music' | 'shake' | 'ichor' | 'glow'
type ToggleKey = 'autoFire' | 'haptics' | 'flashes' | 'reduceMotion'

/** The ACCOUNT tab's state: posting on or off and the leaderboard name. */
export interface SettingsAccount {
  posting: boolean
  name: string
}

interface Row extends ScrollRow {
  /** Lay the row out `w` wide; sets `h`. */
  layout(w: number): void
  refresh(): void
}

function label(text: string, size = 14, fill: number = T.textHi, weight: '500' | '800' = '500'): Text {
  return new Text({ text, style: { fontFamily: FONT.mono, fontWeight: weight, fontSize: size, fill } })
}

/**
 * Settings (section 9.8): an opaque panel with an X button, the tabs AUDIO,
 * VISUALS, CONTROLS and ACCOUNT, and a BACK button in portrait. Landscape puts
 * the rows in two columns. Values show relative to the default (100%). Every
 * change emits the whole Settings object; the ACCOUNT rows call back so the
 * caller can run the name prompt and the confirm sheet.
 */
export class SettingsPanel {
  readonly view = new Container()
  onChange: (s: Settings) => void = () => {}
  onClose: () => void = () => {}
  onPostScores: (on: boolean) => void = () => {}
  onEditName: () => void = () => {}
  onRemoveScores: () => void = () => {}
  onShowTips: () => void = () => {}
  /** Where a toast may sit while the panel is open (screen px): left of the X. */
  toastSlot: ToastSlot | null = null

  private readonly root = new Container()
  private readonly backdrop = new Graphics()
  private readonly title: Text
  private readonly close = new IconButton('close')
  private tabs: Segmented
  private back: Button
  private readonly scroll = new ScrollView()
  private readonly tabRows: Row[][]
  private tab = 0
  private settings: Settings = { ...DEFAULT_SETTINGS }
  private account: SettingsAccount = { posting: false, name: '' }
  private tipsReset = false
  private w = 0
  private h = 0
  private insets: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

  constructor() {
    // The backdrop swallows every tap so nothing under the panel reacts.
    this.backdrop.eventMode = 'static'
    this.title = new Text({ text: 'SETTINGS', style: { fontFamily: FONT.display, fontSize: 22, fontWeight: '900', fill: COLORS.player, letterSpacing: 2 } })
    this.title.anchor.set(0, 0.5)
    this.close.onClick = () => this.onClose()
    this.tabs = new Segmented(TABS, 343, 13)
    this.tabs.onChange = (i) => this.select(i)
    this.back = new Button('BACK', 343, TARGET.secondary, 'secondary', 16)
    this.back.onClick = () => this.onClose()

    this.tabRows = [
      [this.slider('Master', 'master', 1), this.slider('SFX', 'sfx', 1), this.slider('Music', 'music', 1)],
      [
        this.slider('Screen Shake', 'shake', 1.5),
        this.slider('Ichor', 'ichor', 1.5),
        this.slider('Glow', 'glow', 1.5),
        this.damageRow(),
        this.toggle('Flashes', 'flashes'),
        this.toggle('Reduce Motion', 'reduceMotion'),
      ],
      [
        this.toggle('Auto-fire', 'autoFire'),
        this.toggle('Haptics', 'haptics'),
        this.textRow('Keyboard: WASD move, mouse aim, Space dash, Esc pause'),
        this.button('SHOW TIPS AGAIN', 'secondary', () => {
          this.tipsReset = true
          this.onShowTips()
          this.refreshRows()
        }, () => (this.tipsReset ? 'TIPS RESET' : 'SHOW TIPS AGAIN')),
      ],
      [this.postRow(), this.nameRow(), this.button('REMOVE MY SCORES', 'danger', () => this.onRemoveScores())],
    ]
    for (const rows of this.tabRows) for (const r of rows) this.scroll.content.addChild(r.view)

    this.root.addChild(this.backdrop, this.title, this.close.view, this.tabs.view, this.scroll.view, this.back.view)
    this.view.addChild(this.root)
    this.view.visible = false
  }

  open(settings: Settings, account: SettingsAccount): void {
    this.settings = { ...settings }
    this.account = account
    this.tipsReset = false
    this.view.visible = true
    this.refreshRows()
    this.relayout()
  }

  /** The ACCOUNT tab after a name prompt or a removal. */
  setAccount(account: SettingsAccount): void {
    this.account = account
    if (this.view.visible) this.refreshRows()
  }

  hide(): void {
    this.view.visible = false
  }

  isOpen(): boolean {
    return this.view.visible
  }

  layout(w: number, h: number, insets: Insets): void {
    this.w = w
    this.h = h
    this.insets = insets
    if (this.view.visible) this.relayout()
  }

  private select(i: number): void {
    this.tab = i
    this.scroll.scrollTo(0)
    this.relayout()
  }

  private emit(): void {
    this.onChange({ ...this.settings })
  }

  private refreshRows(): void {
    for (const rows of this.tabRows) for (const r of rows) r.refresh()
  }

  private relayout(): void {
    const s = uiScale(this.w, this.h)
    this.root.scale.set(s)
    const W = this.w / s
    const H = this.h / s
    const L = this.insets.left / s
    const R = this.insets.right / s
    const top = this.insets.top / s
    const bottom = H - this.insets.bottom / s
    const landscape = W > H
    this.backdrop.clear()
    this.backdrop.rect(0, 0, W, H).fill(T.bgVoid)
    this.backdrop.hitArea = new Rectangle(0, 0, W, H)
    const cw = W - L - R - 32
    const x0 = L + 16
    this.title.position.set(x0, top + 12 + TARGET.compact / 2)
    this.close.position(W - R - 16 - TARGET.compact, top + 12)
    this.toastSlot = { x: x0 * s, y: (top + 8) * s, w: (cw - TARGET.compact - 8) * s }
    const tabW = Math.min(cw, landscape ? 560 : COL_MAX)
    const cx = x0 + cw / 2
    if (Math.round(this.tabs.view.width) !== Math.round(tabW)) this.rebuildTabs(tabW)
    this.tabs.view.position.set(cx - tabW / 2, top + 12 + TARGET.compact + 12)
    const contentTop = this.tabs.view.y + Segmented.H + 16
    this.back.view.visible = !landscape
    const backW = Math.min(cw, COL_MAX)
    this.back.position(cx - backW / 2, bottom - 16 - TARGET.secondary)
    if (!landscape && Math.round(this.back.view.width) !== Math.round(backW)) this.rebuildBack(backW)
    const contentBottom = landscape ? bottom - 12 : bottom - 16 - TARGET.secondary - 12

    // Rows: one column in portrait; landscape splits them into two columns.
    for (const rows of this.tabRows) for (const r of rows) r.view.visible = false
    const rows = this.tabRows[this.tab]!
    const cols = landscape ? 2 : 1
    const colW = cols === 2 ? Math.min(360, (Math.min(cw, 760) - 24) / 2) : Math.min(cw, COL_MAX)
    const areaW = cols * colW + (cols - 1) * 24
    for (const r of rows) r.layout(colW)
    const total = rows.reduce((a, r) => a + r.h + ROW_GAP, 0)
    let col = 0
    let y = 0
    let maxY = 0
    for (const r of rows) {
      if (cols === 2 && col === 0 && y > 0 && y + r.h / 2 > total / 2) {
        col = 1
        y = 0
      }
      r.view.position.set(col * (colW + 24), y)
      r.view.visible = true
      y += r.h + ROW_GAP
      maxY = Math.max(maxY, y)
    }
    this.scroll.setViewport(cx - areaW / 2, contentTop, areaW, contentBottom - contentTop)
    this.scroll.setRows(rows, maxY)
  }

  private rebuildTabs(w: number): void {
    const i = this.root.getChildIndex(this.tabs.view)
    this.tabs.view.destroy({ children: true })
    const t = new Segmented(TABS, w, 13)
    t.set(this.tab)
    t.onChange = (k) => this.select(k)
    this.tabs = t
    this.root.addChildAt(t.view, i)
  }

  private rebuildBack(w: number): void {
    const i = this.root.getChildIndex(this.back.view)
    const { x, y } = this.back.view.position
    this.back.view.destroy({ children: true })
    const b = new Button('BACK', w, TARGET.secondary, 'secondary', 16)
    b.onClick = () => this.onClose()
    b.position(x, y)
    this.back = b
    this.root.addChildAt(b.view, i)
  }

  // --- rows ----------------------------------------------------------------

  private slider(name: string, key: SliderKey, scale: number): Row {
    const view = new Container()
    const lbl = label(name)
    const value = label('', 13, T.textMuted, '800')
    value.anchor.set(1, 0)
    view.addChild(lbl, value)
    let slider: Slider | null = null
    let w = 0
    const refresh = (): void => {
      value.text = Math.round((this.settings[key] / DEFAULT_SETTINGS[key]) * 100) + '%'
      slider?.set(this.settings[key] / scale)
    }
    const row: Row = {
      view,
      h: SLIDER_H,
      layout: (rw: number) => {
        value.position.set(rw, 4)
        lbl.position.set(0, 4)
        if (rw === w && slider) return
        w = rw
        slider?.view.destroy({ children: true })
        // The knob travels inside the row: 12 px in from each end.
        slider = new Slider(rw - 24)
        slider.view.position.set(12, 38)
        slider.onChange = (v) => {
          this.settings[key] = v * scale
          refresh()
          this.emit()
        }
        view.addChild(slider.view)
        refresh()
      },
      refresh,
    }
    return row
  }

  private toggle(name: string, key: ToggleKey): Row {
    const view = new Container()
    const lbl = label(name)
    lbl.anchor.set(0, 0.5)
    const t = new Toggle()
    t.onChange = (on) => {
      this.settings[key] = on
      this.emit()
    }
    view.addChild(lbl, t.view)
    return {
      view,
      h: TOGGLE_H,
      layout: (rw: number) => {
        lbl.position.set(0, TOGGLE_H / 2)
        t.view.position.set(rw - Toggle.W, (TOGGLE_H - Toggle.H) / 2)
      },
      refresh: () => t.set(this.settings[key]),
    }
  }

  private damageRow(): Row {
    const view = new Container()
    const lbl = label('Damage Numbers')
    view.addChild(lbl)
    let seg: Segmented | null = null
    let w = 0
    const refresh = (): void => seg?.set(Math.max(0, DAMAGE_MODES.indexOf(this.settings.damageNumbers)))
    return {
      view,
      h: SEG_ROW_H,
      layout: (rw: number) => {
        lbl.position.set(0, 4)
        if (rw === w && seg) return
        w = rw
        seg?.view.destroy({ children: true })
        seg = new Segmented(['ALL', 'BIG HITS', 'OFF'], rw, 13)
        seg.view.position.set(0, 28)
        seg.onChange = (i) => {
          this.settings.damageNumbers = DAMAGE_MODES[i]!
          this.emit()
        }
        view.addChild(seg.view)
        refresh()
      },
      refresh,
    }
  }

  private textRow(text: string): Row {
    const view = new Container()
    const t = new Text({ text, style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 13, lineHeight: 18, fill: T.textMuted, wordWrap: true } })
    view.addChild(t)
    const row: Row = {
      view,
      h: 0,
      layout: (rw: number) => {
        t.style.wordWrapWidth = rw
        t.position.set(0, 8)
        row.h = t.height + 16
      },
      refresh: () => {},
    }
    return row
  }

  private button(text: string, variant: 'secondary' | 'danger', onClick: () => void, labelOf?: () => string): Row {
    const view = new Container()
    let b: Button | null = null
    let w = 0
    const row: Row = {
      view,
      h: TARGET.secondary + 12,
      layout: (rw: number) => {
        if (rw === w && b) return
        w = rw
        b?.view.destroy({ children: true })
        b = new Button(labelOf ? labelOf() : text, rw, TARGET.secondary, variant, 15)
        b.position(0, 6)
        b.onClick = onClick
        view.addChild(b.view)
      },
      refresh: () => b?.setText(labelOf ? labelOf() : text),
    }
    return row
  }

  private postRow(): Row {
    const view = new Container()
    const lbl = label('POST SCORES', 14, T.textHi, '800')
    lbl.anchor.set(0, 0.5)
    const help = new Text({
      text: 'Posts your nickname, score, run stats, pilot, world and country.',
      style: { fontFamily: FONT.mono, fontWeight: '500', fontSize: 12, lineHeight: 16, fill: T.textMuted, wordWrap: true },
    })
    const t = new Toggle()
    t.onChange = (on) => {
      // The caller turns posting on only after a name; the toggle follows its answer.
      t.set(this.account.posting)
      this.onPostScores(on)
    }
    view.addChild(lbl, help, t.view)
    const row: Row = {
      view,
      h: TOGGLE_H,
      layout: (rw: number) => {
        lbl.position.set(0, TOGGLE_H / 2)
        t.view.position.set(rw - Toggle.W, (TOGGLE_H - Toggle.H) / 2)
        help.style.wordWrapWidth = rw
        help.position.set(0, TOGGLE_H)
        row.h = TOGGLE_H + help.height + 8
      },
      refresh: () => t.set(this.account.posting),
    }
    return row
  }

  private nameRow(): Row {
    const view = new Container()
    const lbl = label('NAME', 14, T.textHi, '800')
    lbl.anchor.set(0, 0.5)
    const value = label('', 14, T.textPrimary, '800')
    value.anchor.set(0, 0.5)
    const edit = new Button('EDIT', 88, 40, 'secondary', 14)
    edit.onClick = () => this.onEditName()
    view.addChild(lbl, value, edit.view)
    return {
      view,
      h: TOGGLE_H,
      layout: (rw: number) => {
        lbl.position.set(0, TOGGLE_H / 2)
        value.position.set(lbl.width + 16, TOGGLE_H / 2)
        edit.position(rw - 88, (TOGGLE_H - 40) / 2)
      },
      refresh: () => {
        value.text = this.account.name || 'NOT SET'
        value.style.fill = this.account.name ? T.textPrimary : T.textMuted
      },
    }
  }
}
