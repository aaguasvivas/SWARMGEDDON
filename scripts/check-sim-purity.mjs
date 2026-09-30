// Sim purity gate (npm run check:sim). The sim (src/systems, src/game,
// src/content) must replay identically on every device, so it may not read the
// clock, the viewport, the save, settings or Math.random, and it may not drive
// presentation directly (it emits to the FeelQueue instead). Comments are
// stripped first, so prose about the camera or a "window" is not a violation.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SIM_DIRS = ['src/systems', 'src/game', 'src/content']
const FORBIDDEN = [
  'Math.random', 'performance.now', 'Date.now', 'loadJSON', 'saveJSON', 'localStorage',
  'window.', 'document.', 'devicePixelRatio', 'viewW', 'viewH', 'camX', 'camY',
  'camera', 'settings', 'audio.play', 'juice',
]

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|js|mjs)$/.test(name)) out.push(p)
  }
  return out
}

/** Blank out comments, keeping newlines so line numbers stay true. */
function stripComments(src) {
  let out = ''
  let i = 0
  const n = src.length
  while (i < n) {
    const c = src[i]
    const d = src[i + 1]
    if (c === '/' && d === '/') {
      while (i < n && src[i] !== '\n') i++
    } else if (c === '/' && d === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) {
        if (src[i] === '\n') out += '\n'
        i++
      }
      i += 2
    } else if (c === "'" || c === '"' || c === '`') {
      const q = c
      out += c
      i++
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') {
          out += src[i]
          i++
        }
        out += src[i]
        i++
      }
      if (i < n) out += src[i]
      i++
    } else {
      out += c
      i++
    }
  }
  return out
}

const files = SIM_DIRS.flatMap((d) => walk(join(ROOT, d), []))
if (files.length === 0) {
  console.error('check:sim found no sim files; the directory list is wrong')
  process.exit(1)
}
const hits = []
for (const f of files) {
  const lines = stripComments(readFileSync(f, 'utf8')).split('\n')
  lines.forEach((line, i) => {
    for (const token of FORBIDDEN) {
      if (line.includes(token)) hits.push(`${relative(ROOT, f)}:${i + 1}: ${token}`)
    }
  })
}
if (hits.length > 0) {
  console.error(`check:sim failed: ${hits.length} forbidden reference(s) in the sim`)
  for (const h of hits) console.error('  ' + h)
  process.exit(1)
}
console.log(`check:sim ok (${files.length} files)`)
