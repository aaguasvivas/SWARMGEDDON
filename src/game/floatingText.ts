import { Text } from 'pixi.js'
import type { Poolable } from '../core/pool.ts'

/** Floating damage number. Rises and fades. Capped + pooled (Text is the
 *  priciest object here, so we bound how many exist at once). */
export class FloatingText implements Poolable {
  alive = false

  x = 0
  y = 0
  prevY = 0
  vy = 0
  life = 0
  maxLife = 0.6

  readonly text: Text

  constructor() {
    this.text = new Text({
      text: '',
      style: {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: 15,
        fontWeight: 'bold',
        fill: 0xeafff0,
      },
    })
    this.text.anchor.set(0.5)
    this.text.visible = false
  }
}
