import { Container, type Sprite } from 'pixi.js'
import { FIXED_DT, MAX_HAZARDS } from '../config.ts'
import { ENEMIES } from '../content/enemies.ts'
import { HZ_CIRCLE, HZ_LANE } from '../game/hazard.ts'
import type { World } from '../game/world.ts'
import { HZ_TEX, type TextureRegistry } from './textures.ts'

/** Damaging hazards read as danger; markers and boss telegraphs wear the boss color. */
const DANGER_TINT = 0xff5a3c
/** Section 6.5: the telegraph fill ramps from TELE_ALPHA0 to TELE_ALPHA1. */
const TELE_ALPHA0 = 0.25
const TELE_ALPHA1 = 0.55
const LIVE_ALPHA = 0.8
const MARKER_LIVE_ALPHA = 0.35
const CAGE_FORM_SEC = 1.5
const CAGE_ALPHA = 0.9

/**
 * Draws the sim's hazards and the boss cage (world space, on the floor under
 * the swarm). Reads sim state only; nothing here reaches the sim.
 */
export class HazardRenderer {
  readonly view = new Container()
  private readonly sprites: Sprite[] = []
  private readonly cage: Sprite

  constructor(private readonly texReg: TextureRegistry) {
    for (let i = 0; i < MAX_HAZARDS; i++) {
      const s = texReg.makeSprite('hzDisc')
      this.sprites.push(s)
      this.view.addChild(s)
    }
    this.cage = texReg.makeSprite('hzCage')
    this.view.addChild(this.cage)
  }

  update(world: World, alpha: number): void {
    const bossTint = world.broodTint(ENEMIES[world.script.boss.midId]!.tint)
    const a = world.hazards.active
    let n = 0
    for (let i = 0; i < a.length && n < MAX_HAZARDS; i++) {
      const h = a[i]!
      if (!h.alive) continue
      const s = this.sprites[n++]!
      s.visible = true
      s.position.set(h.x, h.y)
      if (h.shape === HZ_CIRCLE) {
        this.texReg.applySprite(s, 'hzDisc')
        s.rotation = 0
        s.scale.set(h.r / HZ_TEX.discR)
      } else if (h.shape === HZ_LANE) {
        this.texReg.applySprite(s, 'hzLane')
        s.rotation = h.ang
        s.scale.set(h.len / HZ_TEX.laneLen, h.r / HZ_TEX.laneHalf)
      } else {
        this.texReg.applySprite(s, 'hzSector')
        s.rotation = h.ang + h.arc / 2
        s.scale.set(h.len / HZ_TEX.sectorR)
      }
      s.tint = h.damage > 0 ? DANGER_TINT : bossTint
      if (h.tele > 0) s.alpha = TELE_ALPHA0 + (TELE_ALPHA1 - TELE_ALPHA0) * (1 - h.tele / h.teleMax)
      else s.alpha = h.damage > 0 ? LIVE_ALPHA : MARKER_LIVE_ALPHA
    }
    for (let i = n; i < MAX_HAZARDS; i++) this.sprites[i]!.visible = false

    const c = world.director.cage
    const ring = this.cage
    ring.visible = c.active
    if (c.active) {
      // The ring forms with a scale-in, easing out, over CAGE_FORM_SEC.
      const k = Math.min(1, (world.time + alpha * FIXED_DT - c.formingFrom) / CAGE_FORM_SEC)
      const form = 1 - (1 - k) * (1 - k) * (1 - k)
      ring.position.set(c.x, c.y)
      ring.scale.set((c.r / HZ_TEX.cageR) * (0.6 + 0.4 * form))
      ring.alpha = CAGE_ALPHA * form
      ring.tint = bossTint
    }
  }
}
