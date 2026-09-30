// Shared with the leaderboard worker: import nothing browser-only.
export const SIM_VERSION = 2
export const KILL_PTS_PER_XP = 10
export const MAX_TIER = 8
export const TIER_STEPS = [0, 10, 30, 70, 150, 300, 550, 900] as const
export const CHAIN_DECAY_S = 2.0
export const CONTACT_HIT_HP = 10
export const CONTACT_ACC_RESET_S = 1.0
export const CLEAR_BONUS = 50_000
export const CLEAR_SPEED_PTS = 100 // per second the clear beats 14:00
export const STALEMATE_S = 840
export const MAX_THREAT = 4
export const CLOSE_CALL_CHAIN = 15

/** The PRIME beat (A7.1). A PRIME never arrives before it, and a mid boss killed
 *  just before it delays the arrival by at most BOSS_MIN_GAP. scripts/test-rules.mjs
 *  checks these three against every world script and config.ts. */
export const PRIME_AT_S = 630
export const PRIME_DELAY_MAX_S = 20
export const PRIME_STALEMATE_S = 210
/** The earliest clear the server accepts. A PRIME spends BOSS_EMERGE (1.0 s)
 *  untargetable after it arrives, so no kill lands before 631 s; the bound sits
 *  at the arrival itself, and that emerge second is the margin. */
export const CLEAR_MIN_MS = PRIME_AT_S * 1000
/** The latest end of an uncleared run: the latest PRIME arrival plus its
 *  stalemate, with 5 s of margin. */
export const UNCLEARED_MAX_MS = (PRIME_AT_S + PRIME_DELAY_MAX_S + PRIME_STALEMATE_S) * 1000 + 5000

export function clearBonus(clearMs: number): number {
  return CLEAR_BONUS + CLEAR_SPEED_PTS * Math.max(0, STALEMATE_S - Math.floor(clearMs / 1000))
}

export function scoreOf(killPts: number, xpSum: number, clearMs: number, threat: number): number {
  const kp = Math.min(Math.max(0, Math.floor(killPts)), MAX_TIER * KILL_PTS_PER_XP * xpSum)
  const cb = clearMs > 0 ? clearBonus(clearMs) : 0
  return Math.floor(((kp + cb) * (10 + 2 * threat)) / 10)
}

/** Multiplier tier (1 to MAX_TIER) for a chain length (A14). */
export function tierOf(chain: number): number {
  let t = 1
  for (let i = 1; i < TIER_STEPS.length; i++) if (chain >= TIER_STEPS[i]!) t = i + 1
  return t
}

/**
 * Hash an arbitrary string into a 32-bit seed (xmur3). The Daily seed is
 * seedFromString('swarmgeddon:' + date), so the worker must compute it bit for bit.
 */
export function seedFromString(str: string): number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  return (h ^= h >>> 16) >>> 0
}

// --- Daily v2 (section 7.5) ---------------------------------------------------

export const KNOWN_WORLDS: readonly string[] = ['hive', 'depths', 'wastes']
export const KNOWN_PILOTS: readonly string[] = ['nova', 'ember', 'vesper']

/** OWNER DECISION (spec section 0, item 1): Daily #1, the v2 release day in UTC.
 *  Set it in the release PR. The seed does not depend on it; the number, world,
 *  pilot and threat of every day do. */
export const DAILY_EPOCH = '2026-09-30'

export interface DailyRotation {
  from: string
  worlds: readonly string[]
  pilots: readonly string[]
}
export const ROTATIONS: readonly DailyRotation[] = [{ from: DAILY_EPOCH, worlds: KNOWN_WORLDS, pilots: KNOWN_PILOTS }]
export const DAILY_THREAT_CYCLE = [0, 0, 1, 0, 1, 0, 2] as const

export interface DailySpec {
  date: string
  number: number
  seed: number
  world: string
  pilot: string
  threat: number
}

const DAY_MS = 86_400_000

function mod(n: number, m: number): number {
  return ((n % m) + m) % m
}

/** A real UTC calendar day written as YYYY-MM-DD. */
export function isDay(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const t = Date.parse(s + 'T00:00:00Z')
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s
}

/** The UTC day of an epoch-ms time. */
export function dayOf(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** Days from DAILY_EPOCH to `date` (negative before it). */
export function dayIndex(date: string): number {
  return Math.round((Date.parse(date + 'T00:00:00Z') - Date.parse(DAILY_EPOCH + 'T00:00:00Z')) / DAY_MS)
}

export function dailySpec(date: string): DailySpec {
  const d = dayIndex(date)
  let rot = ROTATIONS[0]!
  for (const r of ROTATIONS) if (r.from <= date) rot = r
  const n = rot.worlds.length
  return {
    date,
    number: d + 1,
    seed: seedFromString('swarmgeddon:' + date),
    world: rot.worlds[mod(d, n)]!,
    pilot: rot.pilots[mod(d + Math.floor(d / n), rot.pilots.length)]!,
    threat: DAILY_THREAT_CYCLE[mod(d, DAILY_THREAT_CYCLE.length)]!,
  }
}

/** ISO week of a UTC day, `2026-W40`. The THIS WEEK board resets Monday 00:00 UTC. */
export function isoWeek(date: string): string {
  const t = Date.parse(date + 'T00:00:00Z')
  const monday0 = (new Date(t).getUTCDay() + 6) % 7
  const thursday = t + (3 - monday0) * DAY_MS
  const year = new Date(thursday).getUTCFullYear()
  const week = 1 + Math.floor((thursday - Date.UTC(year, 0, 1)) / (7 * DAY_MS))
  return `${year}-W${String(week).padStart(2, '0')}`
}

// --- Server plausibility (section 8.4) ------------------------------------------

/** The run summary a client posts, as the server reads it. */
export interface RunSummary {
  world: string
  pilot: string
  threat: number
  timeMs: number
  kills: number
  xpSum: number
  killPts: number
  closeCalls: number
  bestChain: number
  hits: number
  level: number
  bosses: number
  cleared: boolean
  clearMs: number
}

/** The first plausibility rule the summary breaks, or null. killPts has no
 *  upper rule: scoreOf clamps it to MAX_TIER x KILL_PTS_PER_XP x xpSum, and the
 *  server stores the clamped value. */
export function implausible(s: RunSummary): string | null {
  const ints = [s.threat, s.timeMs, s.kills, s.xpSum, s.killPts, s.closeCalls, s.bestChain, s.hits, s.level, s.bosses, s.clearMs]
  for (const n of ints) if (!Number.isSafeInteger(n) || n < 0) return 'integers'
  if (typeof s.cleared !== 'boolean') return 'integers'
  if (!KNOWN_WORLDS.includes(s.world)) return 'world'
  if (!KNOWN_PILOTS.includes(s.pilot)) return 'pilot'
  if (s.threat > MAX_THREAT) return 'threat'
  if (s.timeMs < 1_000 || s.timeMs > 3_600_000) return 'time'
  if (s.kills * 1000 > 250 * s.timeMs + 100_000) return 'kills'
  if (s.xpSum < s.kills || s.xpSum > 30 * s.kills + 450 * s.bosses) return 'xp'
  // A Close Call pays at most once per dash, and a dash lasts 9 ticks.
  if (s.closeCalls * 1000 > 7 * s.timeMs) return 'closeCalls'
  if (s.bestChain > s.kills + CLOSE_CALL_CHAIN * s.closeCalls) return 'chain'
  if (s.hits * 1000 > 20 * s.timeMs + 10_000) return 'hits'
  if (s.level < 1 || s.level > 500) return 'level'
  if (s.cleared) {
    // A mid boss still alive at the PRIME beat ascends with no credit, so one kill can clear.
    if (s.clearMs < CLEAR_MIN_MS || s.clearMs > s.timeMs || s.bosses < 1) return 'clear'
  } else if (s.clearMs !== 0 || s.timeMs > UNCLEARED_MAX_MS) {
    return 'uncleared'
  }
  if (s.bosses > 3 + Math.ceil(Math.max(0, s.timeMs - s.clearMs) / 180_000)) return 'bosses'
  return null
}
