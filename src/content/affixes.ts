import { ENEMIES, ENEMY_IDS } from './enemies.ts'

/**
 * Elite affixes (docs/NEXT-LEVEL.md A9). An elite's affixes are drawn at warn
 * time from its world's pool (script stream) and stored as a bit mask on the
 * Enemy; the sim reads the bits, presentation reads names and colors.
 */

export type AffixId = 'molten' | 'hasted' | 'brood' | 'volatile' | 'shielded'

export interface AffixDef {
  id: AffixId
  bit: number
  name: string
  /** Outline and name tag color. */
  color: number
}

/** Bit order is name order on a tag. */
export const AFFIXES: readonly AffixDef[] = [
  { id: 'molten', bit: 1, name: 'MOLTEN', color: 0xff7a3a },
  { id: 'hasted', bit: 2, name: 'HASTED', color: 0x57c8ff },
  { id: 'brood', bit: 4, name: 'BROOD', color: 0x4dffa0 },
  { id: 'volatile', bit: 8, name: 'VOLATILE', color: 0xffe066 },
  { id: 'shielded', bit: 16, name: 'SHIELDED', color: 0xb886ff },
]

export const AFFIX_BIT: Readonly<Record<AffixId, number>> = { molten: 1, hasted: 2, brood: 4, volatile: 8, shielded: 16 }
export const AF_MOLTEN = 1, AF_HASTED = 2, AF_BROOD = 4, AF_VOLATILE = 8, AF_SHIELDED = 16

/** MOLTEN: an acid (Hive) or magma (Wastes) pool under the elite this often. */
export const MOLTEN_EVERY = 1.0
/** HASTED: speed multiplier (the 240 u/s ceiling still applies) and the
 *  multiplier on fire and teleport cooldowns. */
export const HASTED = { speedMul: 1.5, cooldownMul: 0.75 } as const
/** BROOD: world fodder around the elite at half HP and again on death. */
export const BROOD = { count: 4, r: 30, atHpFrac: 0.5 } as const
/** VOLATILE: the death blast, a telegraphed hazard circle (flat authored damage). */
export const VOLATILE = { r: 110, tele: 0.8, dmg: 22 } as const
/** SHIELDED: front armor and the facing turn rate that lets a flank beat it. */
export const SHIELDED = { armor: 0.6, turnRate: 2.4 } as const

/** A name tag's title fits one line up to this many characters (section 4.7). */
const TAG_TITLE_MAX = 18
const MASKS = 32

const TAG_TITLE: string[] = []
const TAG_SUB: string[] = []

/** Section 4.7: `MOLTEN GUARDIAN` when the affix names and the elite's name fit
 *  18 characters; otherwise the name, with the affixes under it. */
function tag(displayName: string, mask: number): [string, string] {
  if (mask === 0) return [displayName, '']
  const names: string[] = []
  for (const a of AFFIXES) if ((mask & a.bit) !== 0) names.push(a.name)
  const one = names.join(' ') + ' ' + displayName
  return one.length <= TAG_TITLE_MAX ? [one, ''] : [displayName, names.join(' · ')]
}

for (let i = 0; i < ENEMY_IDS.length; i++) {
  const def = ENEMIES[ENEMY_IDS[i]!]!
  for (let m = 0; m < MASKS; m++) {
    const [title, sub] = def.elite ? tag(def.displayName, m) : [def.displayName, '']
    TAG_TITLE.push(title)
    TAG_SUB.push(sub)
  }
}

/** Name tag lines for an elite of def index `idx` with affix `mask` (precomputed: no allocation). */
export function tagTitle(idx: number, mask: number): string {
  return TAG_TITLE[idx * MASKS + (mask & (MASKS - 1))]!
}
export function tagSub(idx: number, mask: number): string {
  return TAG_SUB[idx * MASKS + (mask & (MASKS - 1))]!
}

/** Tag and outline color: the lowest affix bit's, or 0 when the elite has none. */
export function affixColor(mask: number): number {
  for (let i = 0; i < AFFIXES.length; i++) if ((mask & AFFIXES[i]!.bit) !== 0) return AFFIXES[i]!.color
  return 0
}
