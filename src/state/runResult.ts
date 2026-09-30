import { ENEMY_IDS } from '../content/enemies.ts'
import { FUSIONS } from '../content/perks.ts'
import { nextBeatLabel } from '../content/runScripts.ts'
import { WEAPON_LIST } from '../content/weapons.ts'
import type { RunMode, World } from '../game/world.ts'

/** Everything a finished run reports: recap, stats, feats, leaderboard (section 7.2). */
export interface RunResult {
  v: 2; mode: RunMode; ranked: boolean
  end: 'death' | 'quit' | 'clear' | 'stalemate' | 'interrupted'
  cleared: boolean; clearMs: number; overtimeSec: number; nextBeat: string | null
  date: string // UTC day at START
  dailyNumber: number; seed: number; character: string; arena: string; threat: number; paint: string
  time: number; kills: number; level: number; score: number; killPts: number; xpSum: number
  bossesSlain: number; bossesFlawless: number; elitesSlain: number
  bestChain: number; peakTier: number; hits: number; longestNoHit: number; damageTaken: number
  revivesUsed: number; podsEquipped: number; weapons: string[]
  dashes: number; closeCalls: number; fusions: string[]; evolutions: string[]
  perks: [string, number][]; killsByEnemy: Record<string, number>
  killer: string | null // EnemyDef id, 'acid', 'hazard', or null
}

export type RunEnd = RunResult['end']

/** Run identity that lives outside the sim. */
export interface RunMeta {
  date: string
  ranked: boolean
  dailyNumber: number
  paint: string
}

/** Snapshot the world into a RunResult. Allocates; endRun only. */
export function buildRunResult(w: World, end: RunEnd, meta: RunMeta): RunResult {
  const weapons: string[] = []
  for (let i = 0; i < WEAPON_LIST.length; i++) if (w.weaponsUsed[i]) weapons.push(WEAPON_LIST[i]!.id)
  const killsByEnemy: Record<string, number> = {}
  for (let i = 0; i < ENEMY_IDS.length; i++) if (w.killsByDef[i]! > 0) killsByEnemy[ENEMY_IDS[i]!] = w.killsByDef[i]!
  return {
    v: 2,
    mode: w.mode,
    ranked: meta.ranked,
    end,
    cleared: w.clearMs > 0,
    clearMs: w.clearMs,
    overtimeSec: w.director.runState === 'overtime' ? w.time - w.director.clearTime : 0,
    nextBeat: nextBeatLabel(w.script, w.time),
    date: meta.date,
    dailyNumber: meta.dailyNumber,
    seed: w.seed,
    character: w.character.id,
    arena: w.arenaTheme.id,
    threat: w.threat,
    paint: meta.paint,
    time: w.time,
    kills: w.kills,
    level: w.level,
    score: w.score,
    killPts: w.killPts,
    xpSum: w.xpSum,
    bossesSlain: w.bossesSlain,
    bossesFlawless: w.bossesFlawless,
    elitesSlain: w.elitesSlain,
    bestChain: w.bestChain,
    peakTier: w.peakTier,
    hits: w.hits,
    longestNoHit: w.longestNoHit,
    damageTaken: Math.round(w.damageTaken),
    revivesUsed: w.revivesUsed,
    podsEquipped: w.podsEquipped,
    weapons,
    dashes: w.dashes,
    closeCalls: w.closeCalls,
    fusions: FUSIONS.filter((f) => w.perkStacks.has(f.id)).map((f) => f.id),
    evolutions: [],
    perks: [...w.perkStacks],
    killsByEnemy,
    killer: end === 'death' ? killerId(w.lastHitBy) : null,
  }
}

function killerId(src: number): string | null {
  if (src >= 0) return ENEMY_IDS[src] ?? null
  if (src === -2) return 'acid'
  if (src === -3) return 'hazard'
  return null
}
