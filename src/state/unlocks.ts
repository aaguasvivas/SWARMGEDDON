import { loadJSON, saveJSON } from '../platform/storage.ts'
import { CHARACTERS, type UnlockMeta } from '../content/characters.ts'
import { ARENAS } from '../content/arenas.ts'
import type { RunResult } from './persistence.ts'

/**
 * Earned-unlock persistence. One flat id set: character and arena ids share the
 * namespace (they're globally unique). `premium` items will ALSO land in this
 * set when purchased/restored — the store only needs to call `grant()`.
 */
const KEY = 'unlocks'

let cache: Set<string> | null = null

function unlockedSet(): Set<string> {
  if (!cache) cache = new Set(loadJSON<string[]>(KEY, []))
  return cache
}

export function isUnlocked(id: string, meta: UnlockMeta): boolean {
  return meta.how === 'default' || unlockedSet().has(id)
}

export function grant(id: string): void {
  const set = unlockedSet()
  if (set.has(id)) return
  set.add(id)
  saveJSON(KEY, [...set])
}

/**
 * Check a finished run against every earnable item; grants and returns the
 * display names of anything NEWLY unlocked (for the game-over banner).
 */
export function evaluateUnlocks(r: RunResult): string[] {
  const fresh: string[] = []
  const consider = (id: string, name: string, meta: UnlockMeta): void => {
    if (meta.how !== 'earn' || !meta.earned) return
    if (unlockedSet().has(id)) return
    if (meta.earned(r)) {
      grant(id)
      fresh.push(name)
    }
  }
  for (const c of CHARACTERS) consider(c.id, `PILOT ${c.name}`, c.unlock)
  for (const a of ARENAS) consider(a.id, a.name, a.unlock)
  return fresh
}
