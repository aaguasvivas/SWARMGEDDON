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
export const CLEAR_MIN_MS = 633_000
export const MAX_THREAT = 4
export const CLOSE_CALL_CHAIN = 15

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
