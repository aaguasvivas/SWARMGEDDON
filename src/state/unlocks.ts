import { loadJSON, saveJSON } from '../platform/storage.ts'
import { FEAT_REWARDS } from '../content/feats.ts'
import { FACTORY_PAINT_ID, PAINTS } from '../content/paints.ts'
import { PERKS, type PerkDef } from '../content/perks.ts'
import { PICKUP_WEAPON_IDS } from '../content/weapons.ts'
import type { RunMode } from '../game/world.ts'

/**
 * The owned set under `unlocks` (section 7.4). Pilots and worlds are stored by
 * bare id; perks, weapons and paints as `perk:`, `weapon:` and `paint:` ids.
 * `grant` is the only writer. Read through on every call, so a grant made in
 * another tab is never rolled back.
 */
const KEY = 'unlocks'

export function ownedKeys(): string[] {
  const v = loadJSON<unknown>(KEY, [])
  return Array.isArray(v) ? v.filter((k): k is string => typeof k === 'string') : []
}

/** An item is locked if and only if a feat rewards it and it was never granted. */
export function isOwned(key: string): boolean {
  return !FEAT_REWARDS.has(key) || ownedKeys().includes(key)
}

/** Add `key` to the owned set. False when it was already owned. */
export function grant(key: string): boolean {
  const keys = ownedKeys()
  if (keys.includes(key)) return false
  keys.push(key)
  saveJSON(KEY, keys)
  return true
}

export interface Pools {
  perks: readonly PerkDef[]
  weapons: readonly string[]
}

/** The content a run may draft and drop, resolved once at run start. The Daily
 *  uses the canonical pools whatever the save holds; Standard keeps the
 *  canonical order, filtered by ownership. */
export function resolvePools(mode: RunMode): Pools {
  if (mode === 'daily') return { perks: PERKS, weapons: PICKUP_WEAPON_IDS }
  const own = new Set(ownedKeys())
  const ok = (key: string): boolean => !FEAT_REWARDS.has(key) || own.has(key)
  return { perks: PERKS.filter((p) => ok('perk:' + p.id)), weapons: PICKUP_WEAPON_IDS.filter((id) => ok('weapon:' + id)) }
}

/** Factory first, then every owned paint in table order. */
export function ownedPaintIds(): string[] {
  const own = new Set(ownedKeys())
  return [FACTORY_PAINT_ID, ...PAINTS.filter((p) => own.has('paint:' + p.id)).map((p) => p.id)]
}
