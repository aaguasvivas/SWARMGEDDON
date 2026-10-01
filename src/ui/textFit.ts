import type { Text } from 'pixi.js'

const SEP = ' · '

/**
 * Set `t` to `s`, breaking it into lines at its ` · ` separators where one
 * line would pass `maxW`, so a run line never splits inside a field (`1,287 /
 * KILLS`). A single field wider than `maxW` keeps the Text's own word wrap.
 * Runs at event rate (screen open).
 */
export function setSeparated(t: Text, s: string, maxW: number): void {
  t.style.wordWrap = false
  t.text = s
  if (t.width <= maxW || !s.includes(SEP)) {
    t.style.wordWrap = t.width > maxW
    t.style.wordWrapWidth = maxW
    return
  }
  const parts = s.split(SEP)
  const lines: string[] = []
  let line = parts[0]!
  for (let i = 1; i < parts.length; i++) {
    const next = line + SEP + parts[i]
    t.text = next
    if (t.width > maxW) {
      lines.push(line)
      line = parts[i]!
    } else {
      line = next
    }
  }
  lines.push(line)
  t.text = lines.join('\n')
  t.style.wordWrap = true
  t.style.wordWrapWidth = maxW
}
