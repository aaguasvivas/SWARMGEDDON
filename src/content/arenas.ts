import type { UnlockMeta } from './characters.ts'
import { DEFAULT_MUSIC_THEME, type MusicTheme } from '../audio/audio.ts'

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
  /** Decor silhouette language, drawn once at build time. */
  decorStyle: 'pods' | 'trench' | 'plates'
  /** Hazard color: acid pools, hazard globs, splash FX (presentation only). */
  hazardTint: number
  /** Ichor stamp tint pair — the signature gore-terrain per world. */
  ichorA: number
  ichorB: number
  /** Music identity (render-side; never touches the sim). */
  music: MusicTheme
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
    decorStyle: 'pods',
    hazardTint: 0x9bff3a, // classic acid green
    ichorA: 0x4ecb3a,
    ichorB: 0x7a2fd6,
    music: DEFAULT_MUSIC_THEME,
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
    decorStyle: 'trench',
    hazardTint: 0xb08aff, // cold violet blasts (no acid pools spawn here — no roster enemy leaves them)
    ichorA: 0x7a5cff,
    ichorB: 0xd8e4ff,
    music: {
      // slow abyssal bed: D-minor-pentatonic sine sub-bass two octaves down,
      // sparse triangle arp, dark lowpass
      bassNotes: [36.71, 36.71, 49, 36.71, 43.65, 36.71, 49, 55],
      arpNotes: [146.83, 174.61, 196, 220, 261.63, 220, 196, 174.61],
      bassWave: 'sine',
      arpWave: 'triangle',
      bpmBase: 72,
      bpmRange: 36,
      bassCutoffBase: 180,
      bassCutoffRange: 220,
      arpCutoffBase: 700,
      arpCutoffRange: 900,
    },
    broodName: 'Psychic Brood',
    broodHueShift: -75,
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
    decorStyle: 'plates',
    hazardTint: 0xff8a3d, // magma — pools/globs read as scorched earth, not slime
    ichorA: 0xff7a3d,
    ichorB: 0x3a2a24,
    music: {
      // driving siege: E-Phrygian-dominant square bass, denser brighter arp
      bassNotes: [82.41, 82.41, 103.83, 82.41, 87.31, 82.41, 110, 103.83],
      arpNotes: [164.81, 207.65, 246.94, 329.63, 246.94, 329.63, 415.3, 329.63],
      bassWave: 'square',
      arpWave: 'square',
      bpmBase: 108,
      bpmRange: 48,
      bassCutoffBase: 380,
      bassCutoffRange: 600,
      arpCutoffBase: 1500,
      arpCutoffRange: 2600,
    },
    broodName: 'Ember Spawn',
    broodHueShift: -30,
    unlock: { how: 'earn', earnDesc: 'complete a Daily Challenge', earned: (r) => r.mode === 'daily' },
  },
]

export const DEFAULT_ARENA_ID = 'hive'

export function arenaById(id: string): ArenaTheme {
  return ARENAS.find((a) => a.id === id) ?? ARENAS[0]!
}
