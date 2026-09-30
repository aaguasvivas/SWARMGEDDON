import { ARENAS } from '../content/arenas.ts'
import { FEATS, featById, featForReward } from '../content/feats.ts'
import { keysWithPrefix, loadJSON, saveJSON } from '../platform/storage.ts'
import { asRecord, completeFeat, evaluateFeatState, loadFeats, saveFeats } from './feats.ts'
import { loadStats, saveStats, type WorldStats } from './stats.ts'
import { grant, ownedKeys } from './unlocks.ts'

/**
 * The one-time v1 to v2 save migration (section 7.4). Runs at boot while
 * `meta:v < 2`. It reads every v1 key shape, grandfathers every owned item and
 * never deletes a key. Returns the welcome toast, or null.
 */
export function migrateSave(today: string): string | null {
  if (num(loadJSON<unknown>('meta:v', 0)) >= 2) return null

  // 1. Legacy maxima. v1 wrote best:endless / best:daily as { score, time,
  //    kills, level } and best:world:<id> as { time, kills }.
  let maxLevel = 0
  let maxTime = 0
  let maxKills = 0
  for (const mode of ['endless', 'daily']) {
    const b = asRecord(loadJSON<unknown>('best:' + mode, null))
    maxLevel = Math.max(maxLevel, num(b['level']))
    maxTime = Math.max(maxTime, num(b['time']))
    maxKills = Math.max(maxKills, num(b['kills']))
  }
  const worldTime = new Map<string, number>()
  for (const key of keysWithPrefix('best:world:')) {
    const id = key.slice('best:world:'.length)
    if (!ARENAS.some((a) => a.id === id)) continue
    const b = asRecord(loadJSON<unknown>(key, null))
    worldTime.set(id, num(b['time']))
    maxLevel = Math.max(maxLevel, num(b['level']))
    maxTime = Math.max(maxTime, num(b['time']))
    maxKills = Math.max(maxKills, num(b['kills']))
  }
  const legacy = ownedKeys()
  const veteran = legacy.length > 0 || maxTime > 0

  const feats = loadFeats()
  let earned = 0
  const credit = (id: string, value: number): void => {
    const f = featById(id)!
    if (feats.done[f.id]) return
    feats.prog[f.id] = Math.max(feats.prog[f.id] ?? 0, value)
    if (value >= f.target) {
      completeFeat(feats, f, today)
      earned++
    }
  }

  if (veteran) {
    // 2. Seed the lifetime stats with each world's best time.
    const s = loadStats()
    for (const [id, t] of worldTime) {
      const w: WorldStats = { runs: 0, seconds: 0, kills: 0, bosses: 0, clears: 0, bestTime: 0, maxThreatCleared: -1, ...s.perWorld[id] }
      w.bestTime = Math.max(w.bestTime, t)
      s.perWorld[id] = w
    }
    s.importedV1 = true
    saveStats(s)

    // 5. Veterans keep the full v1 content: every perk and weapon reward.
    for (const f of FEATS) if (f.reward.startsWith('perk:') || f.reward.startsWith('weapon:')) grant(f.reward)

    // 3. Run feats from the legacy maxima.
    credit('field_promotion', maxLevel)
    credit('overcharged', maxLevel)
    credit('five_alive', maxTime)
    credit('deep_dive', worldTime.get('hive') ?? 0)
    credit('swatter', maxKills)

    // 4. The feat behind each legacy unlock.
    for (const key of legacy) {
      const f = featForReward(key)
      if (f && !feats.done[f.id]) {
        completeFeat(feats, f, today)
        earned++
      }
    }

    // Total feats the seeded stats already meet (worlds with 300+ s).
    earned += evaluateFeatState(feats, null, s, today).length
    saveFeats(feats)
  }

  // 6. A v1 Daily played today used today's ranked attempt.
  if (asRecord(loadJSON<unknown>('daily:last', null))['date'] === today && loadJSON<unknown>('daily:' + today, null) === null) {
    saveJSON('daily:' + today, { rankedStarted: true, ranked: { legacy: true } })
  }

  saveJSON('meta:v', 2)
  return earned > 0 ? `Welcome to v2. Your records earned ${earned} feat${earned === 1 ? '' : 's'}. See RECORDS.` : null
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
