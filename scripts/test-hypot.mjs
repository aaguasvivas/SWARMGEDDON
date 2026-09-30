// hypot() in src/core/vec.ts must equal Math.hypot bit for bit (the Daily
// replays on every device), in plain Node (22.18+, which strips TypeScript
// types). Every pair of the edge values, both orders, then random pairs over
// several magnitude ranges. Object.is tells NaN, +0 and -0 apart.
// Before that, the allocation check: a per-enemy style loop that inlines
// hypot, warm, under the sampling heap profiler; an inlined call must not box
// its result.
//
// Usage: node scripts/test-hypot.mjs [randomPairs]   (default 2000000)
import { Session } from 'node:inspector/promises'
import { hypot } from '../src/core/vec.ts'

const N = parseInt(process.argv[2] ?? '2000000')

// The allocation check runs first, so hypot's NaN and Infinity branches have
// never run when V8 optimizes the loop, as in the game.
const bodies = []
for (let i = 0; i < 500; i++) bodies.push({ x: i * 1.5, y: i * 0.5, vx: 0.5, vy: 0.5 })
const target = { x: 100.5, y: 200.5 }
function seek(dt) {
  for (let i = 0; i < bodies.length; i++) {
    const b = bodies[i]
    const dx = target.x - b.x
    const dy = target.y - b.y
    const d = hypot(dx, dy) || 1
    b.vx = (dx / d) * 70
    b.vy = (dy / d) * 70
    b.x += b.vx * dt
    b.y += b.vy * dt
  }
  target.x += 0.25
}
for (let t = 0; t < 3000; t++) seek(1 / 60)
const session = new Session()
session.connect()
await session.post('HeapProfiler.enable')
await session.post('HeapProfiler.startSampling', { samplingInterval: 1024, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
const TICKS = 600
for (let t = 0; t < TICKS; t++) seek(1 / 60)
const { profile } = await session.post('HeapProfiler.stopSampling')
let loopBytes = 0
const walk = (n) => {
  if (n.callFrame.functionName === 'seek' || n.callFrame.functionName === 'hypot') loopBytes += n.selfSize
  n.children.forEach(walk)
}
walk(profile.head)
const bytesPerCall = +(loopBytes / (TICKS * bodies.length)).toFixed(2)

const EDGE = [
  NaN, 0, -0, Infinity, -Infinity, 1, -1, 0.5, -3, 4, 1e-300, -1e-300, 1e300, -1e300,
  Number.MIN_VALUE, -Number.MIN_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, 2 ** -1074 * 3, 1.7976931348623157e308 / 3,
]
let checked = 0
let failures = 0
const fails = []
const check = (x, y) => {
  checked++
  const a = hypot(x, y)
  const b = Math.hypot(x, y)
  if (Object.is(a, b)) return
  failures++
  if (fails.length < 20) fails.push([x, y, a, b].map((v) => (Object.is(v, -0) ? '-0' : String(v))).join(' '))
}
for (const x of EDGE) for (const y of EDGE) check(x, y)

// mulberry32: a fixed sequence, so a failure reproduces.
let s = 0x5eed1234
const rnd = () => {
  s = (s + 0x6d2b79f5) | 0
  let t = Math.imul(s ^ (s >>> 15), 1 | s)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const RANGES = [
  () => (rnd() - 0.5) * 2,
  () => (rnd() - 0.5) * 4000,
  () => (rnd() - 0.5) * 2 ** (rnd() * 200 - 100),
  () => (rnd() < 0.5 ? -1 : 1) * 2 ** (rnd() * 2046 - 1023),
]
for (let i = 0; i < N; i++) {
  const r = RANGES[i % RANGES.length]
  check(r(), r())
}


// Each failure: x y hypot Math.hypot.
console.log(JSON.stringify({ checked, failures, fails, bytesPerCall }))
process.exit(failures || bytesPerCall > 1 ? 1 : 0)
