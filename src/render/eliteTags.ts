import { Container, type Sprite, Text } from 'pixi.js'
import { affixColor, tagSub, tagTitle } from '../content/affixes.ts'
import type { World } from '../game/world.ts'
import { FONT, INK, T } from '../ui/tokens.ts'
import type { TextureRegistry } from './textures.ts'

const TAG_CAP = 8
const TITLE_PX = 13
const SUB_PX = 12
/** Screen px between the outline ring's top and the tag's lowest line. */
const GAP_PX = 4
/** The affix outline ring sits this far (world units) outside the body. */
const RING_PAD = 8
/** Radius of the baked `ring` texture (content/assets.ts). */
const RING_TEX_R = 28
const RING_ALPHA = 0.85
/** A buried elite's tag stays this visible so its mound can be tracked. */
const SUBMERGED_ALPHA = 0.6

/**
 * Elite name tags and affix outlines (section 4.7, A9). The tag lines (title,
 * then the affixes when they do not fit beside the name) float a fixed number
 * of screen px above the body, in the unbloomed world overlay; the outline is a
 * ring on the floor in the affix color. A slot keeps its elite by uid, so a tag's
 * text is set once when the elite appears. Reads sim state only.
 */
export class EliteTags {
  /** World-space overlay layer (constant screen size). */
  readonly view = new Container()
  /** Floor layer, under the swarm. */
  readonly rings = new Container()
  private readonly titles: Text[] = []
  private readonly subs: Text[] = []
  private readonly ringSprites: Sprite[] = []
  private readonly uid = new Int32Array(TAG_CAP)
  private readonly seen = new Uint8Array(TAG_CAP)

  constructor(texReg: TextureRegistry) {
    for (let i = 0; i < TAG_CAP; i++) {
      const title = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: TITLE_PX, fill: 0xffffff, stroke: { color: INK, width: 4, join: 'round' } } })
      const sub = new Text({ text: '', style: { fontFamily: FONT.mono, fontWeight: '800', fontSize: SUB_PX, fill: 0xffffff, stroke: { color: INK, width: 4, join: 'round' } } })
      title.anchor.set(0.5, 1)
      sub.anchor.set(0.5, 1)
      title.visible = sub.visible = false
      this.titles.push(title)
      this.subs.push(sub)
      this.view.addChild(title, sub)
      const ring = texReg.makeSprite('ring')
      this.ringSprites.push(ring)
      this.rings.addChild(ring)
    }
  }

  /** After renderEntities (it places the sprites this reads). */
  update(world: World, show: boolean, zoom: number): void {
    this.seen.fill(0)
    if (show) {
      const inv = 1 / zoom
      const a = world.enemies.active
      for (let i = 0; i < a.length; i++) {
        const e = a[i]!
        if (!e.alive || !e.def.elite) continue
        let slot = -1
        let free = -1
        for (let s = 0; s < TAG_CAP; s++) {
          if (this.uid[s] === e.uid) {
            slot = s
            break
          }
          if (free < 0 && this.uid[s] === 0) free = s
        }
        if (slot < 0) {
          if (free < 0) continue
          slot = free
          this.assign(slot, e.uid, e.def.idx, e.affix)
        }
        this.seen[slot] = 1
        const sx = e.sprite.x
        const sy = e.sprite.y
        const alpha = e.submerged ? SUBMERGED_ALPHA : e.sprite.alpha
        const sub = this.subs[slot]!
        const title = this.titles[slot]!
        let y = sy - e.radius - RING_PAD - GAP_PX * inv
        if (sub.visible) {
          sub.position.set(sx, y)
          sub.scale.set(inv)
          sub.alpha = alpha
          y -= sub.height
        }
        title.position.set(sx, y)
        title.scale.set(inv)
        title.alpha = alpha
        const ring = this.ringSprites[slot]!
        ring.visible = e.affix !== 0 && !e.submerged
        if (ring.visible) {
          ring.position.set(sx, sy)
          ring.scale.set((e.radius + RING_PAD) / RING_TEX_R)
          ring.alpha = RING_ALPHA * e.sprite.alpha
        }
      }
    }
    for (let s = 0; s < TAG_CAP; s++) {
      if (this.seen[s]) continue
      this.uid[s] = 0
      this.titles[s]!.visible = false
      this.subs[s]!.visible = false
      this.ringSprites[s]!.visible = false
    }
  }

  private assign(slot: number, uid: number, defIdx: number, mask: number): void {
    this.uid[slot] = uid
    const color = mask !== 0 ? affixColor(mask) : T.accentGold
    const title = this.titles[slot]!
    title.text = tagTitle(defIdx, mask)
    title.style.fill = color
    title.visible = true
    const sub = this.subs[slot]!
    const line = tagSub(defIdx, mask)
    sub.visible = line !== ''
    if (sub.visible) {
      sub.text = line
      sub.style.fill = color
    }
    this.ringSprites[slot]!.tint = color
  }
}
