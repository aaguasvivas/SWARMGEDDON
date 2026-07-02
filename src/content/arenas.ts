import type { UnlockMeta } from './characters.ts'

/**
 * Arena themes — pure presentation (floor/grid/border/decor palette) plus the
 * PAIRED enemy brood: a hue rotation applied to every enemy's tint and gib
 * color at spawn, so the whole 15-enemy roster re-skins into a cohesive visual
 * family per arena with zero new art and zero sim impact. The play-field
 * bounds, spawn logic, and enemy behavior are identical across arenas.
 */
export interface ArenaTheme {
  id: string
  name: string
  floor: number
  gridLine: number
  gridLineBright: number
  border: number
  borderGlow: number
  decorColor: number
  /** Paired enemy family. */
  broodName: string
  /** Degrees of hue rotation applied to enemy tints/gibs (0 = native palette). */
  broodHueShift: number
  unlock: UnlockMeta
}

export const ARENAS: readonly ArenaTheme[] = [
  {
    id: 'hive',
    name: 'HIVE MEADOW',
    floor: 0x0a0e16,
    gridLine: 0x141d2e,
    gridLineBright: 0x1d2c44,
    border: 0x2a6f63,
    borderGlow: 0x3df0c0,
    decorColor: 0x6cff5a,
    broodName: 'Acid Hive',
    broodHueShift: 0,
    unlock: { how: 'default' },
  },
  {
    id: 'depths',
    name: 'VIOLET DEPTHS',
    floor: 0x0d0a1a,
    gridLine: 0x1c1638,
    gridLineBright: 0x2c2254,
    border: 0x6b3fa8,
    borderGlow: 0xb06bff,
    decorColor: 0x8a5cff,
    broodName: 'Psychic Brood',
    broodHueShift: 150,
    unlock: { how: 'earn', earnDesc: 'kill 150 in one run', earned: (r) => r.kills >= 150 },
  },
  {
    id: 'wastes',
    name: 'EMBER WASTES',
    floor: 0x140b0a,
    gridLine: 0x2a1714,
    gridLineBright: 0x40221c,
    border: 0x9c4a2a,
    borderGlow: 0xff8a3d,
    decorColor: 0xff7a3d,
    broodName: 'Ember Spawn',
    broodHueShift: -75,
    unlock: { how: 'earn', earnDesc: 'complete a Daily Challenge', earned: (r) => r.mode === 'daily' },
  },
]

export const DEFAULT_ARENA_ID = 'hive'

export function arenaById(id: string): ArenaTheme {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0]!
}
