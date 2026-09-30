// Shared-rules checks (P13). Node imports the game's TypeScript directly.
//
//   node scripts/test-rules.mjs                      the derived clear bounds against
//                                                    every world script and config.ts
//   LB_URL=http://127.0.0.1:8788 node scripts/test-rules.mjs
//                                                    plus dailySpec and isoWeek parity
//                                                    with a LOCAL worker started with
//                                                    `--var DEV_ROUTES:1`, over 400 dates
// Exits 1 on any failure.
import {
  CLEAR_MIN_MS, DAILY_EPOCH, DAILY_THREAT_CYCLE, KNOWN_PILOTS, KNOWN_WORLDS, PRIME_AT_S, PRIME_DELAY_MAX_S,
  PRIME_STALEMATE_S, UNCLEARED_MAX_MS, dailySpec, dayOf, isDay, isoWeek,
} from '../src/core/rules.ts'
import { BOSS_EMERGE, BOSS_MIN_GAP, MID2_LATEST, STALEMATE_AFTER } from '../src/config.ts'
import { WORLD_SCRIPTS } from '../src/content/runScripts.ts'

const DAY = 86_400_000
let failures = 0
function check(name, pass, detail) {
  if (!pass) failures++
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`)
}

// 1. The clear bounds come from the run script (section 4.1, A7.1).
const finals = Object.entries(WORLD_SCRIPTS).map(([id, s]) => [id, s.beats.find((b) => b.kind === 'boss' && b.stage === 'final')?.at])
check('every world script puts the PRIME beat at PRIME_AT_S', finals.every(([, at]) => at === PRIME_AT_S), Object.fromEntries(finals))
check('no boss beat before the PRIME is later than it', Object.values(WORLD_SCRIPTS).every((s) => s.beats.every((b) => b.kind !== 'boss' || b.stage === 'final' || b.at < PRIME_AT_S)))
check('PRIME_DELAY_MAX_S is BOSS_MIN_GAP and mid2 cannot arrive after the PRIME beat', PRIME_DELAY_MAX_S === BOSS_MIN_GAP && MID2_LATEST < PRIME_AT_S, { BOSS_MIN_GAP, MID2_LATEST })
check('PRIME_STALEMATE_S is STALEMATE_AFTER', PRIME_STALEMATE_S === STALEMATE_AFTER, { STALEMATE_AFTER })
check('CLEAR_MIN_MS keeps the BOSS_EMERGE second as margin before the earliest kill', CLEAR_MIN_MS === PRIME_AT_S * 1000 && BOSS_EMERGE >= 1, { CLEAR_MIN_MS, earliestKillMs: (PRIME_AT_S + BOSS_EMERGE) * 1000 })
check('UNCLEARED_MAX_MS covers the latest stalemate', UNCLEARED_MAX_MS >= (PRIME_AT_S + BOSS_MIN_GAP + STALEMATE_AFTER) * 1000, { UNCLEARED_MAX_MS })

// 2. dailySpec properties.
const from = dayOf(Date.parse(DAILY_EPOCH + 'T00:00:00Z') - 30 * DAY)
const dates = Array.from({ length: 400 }, (_, i) => dayOf(Date.parse(from + 'T00:00:00Z') + i * DAY))
const specs = dates.map((d) => ({ ...dailySpec(d), week: isoWeek(d) }))
check('Daily #1 is DAILY_EPOCH', dailySpec(DAILY_EPOCH).number === 1)
check('every 3 days play every world', specs.every((s, i) => i < 2 || new Set([specs[i - 2].world, specs[i - 1].world, s.world]).size === 3))
const pairs = new Set(specs.slice(30, 39).map((s) => s.world + ':' + s.pilot))
check('every 9 days pair every world with every pilot', pairs.size === 9, [...pairs])
check('threat follows the weekly cycle', specs.every((s) => s.threat === DAILY_THREAT_CYCLE[((s.number - 1) % 7 + 7) % 7]))
check('worlds and pilots are known ids', specs.every((s) => KNOWN_WORLDS.includes(s.world) && KNOWN_PILOTS.includes(s.pilot)))
check('isDay rejects impossible days', isDay('2026-02-28') && !isDay('2026-02-30') && !isDay('2026-9-30'))
check('isoWeek: Monday starts a week, the year edge follows ISO 8601',
  isoWeek('2026-09-27') === '2026-W39' && isoWeek('2026-09-28') === '2026-W40' && isoWeek('2021-01-03') === '2020-W53' && isoWeek('2024-12-30') === '2025-W01')

// 3. Client and worker agree on every date.
if (process.env.LB_URL) {
  const url = `${process.env.LB_URL.replace(/\/+$/, '')}/api/v2/dev/daily?from=${from}&n=${dates.length}`
  const res = await fetch(url)
  const worker = res.ok ? (await res.json()).days : []
  const diff = specs.filter((s, i) => JSON.stringify(s) !== JSON.stringify(worker[i]))
  check(`client and worker dailySpec match on ${dates.length} dates (${from} to ${dates.at(-1)})`, res.ok && worker.length === dates.length && diff.length === 0,
    { status: res.status, workerDays: worker.length, mismatches: diff.length, first: diff[0] })
} else {
  console.log('SKIP  worker parity (set LB_URL)')
}

console.log(JSON.stringify({ failures }))
process.exit(failures ? 1 : 0)
