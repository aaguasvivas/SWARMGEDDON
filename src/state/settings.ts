import type { DamageNumberMode } from '../effects/damageNumbers.ts'
import { loadJSON, saveJSON } from '../platform/storage.ts'

/**
 * Player settings. Volumes are 0..1; `shake` and `ichor` are intensity
 * multipliers (0 disables, 1 default, up to ~1.5 for more drama). Strings are
 * structured for easy i18n later; only EN ships now.
 */
export interface Settings {
  master: number
  sfx: number
  music: number
  shake: number
  ichor: number
  glow: number
  autoFire: boolean
  haptics: boolean
  /** Softer time effects (no hit-stop, gentler slow motion) and no camera punch. */
  reduceMotion: boolean
  damageNumbers: DamageNumberMode
}

export const DEFAULT_SETTINGS: Settings = {
  master: 0.8,
  sfx: 0.9,
  music: 0.55,
  shake: 1,
  ichor: 1,
  glow: 1,
  autoFire: false, // off by default (hold-to-fire); opt in via Settings for trackpad/touch
  haptics: true,
  reduceMotion: prefersReducedMotion(),
  damageNumbers: 'big',
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function loadSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...loadJSON('settings', {}) }
}

export function saveSettings(s: Settings): void {
  saveJSON('settings', s)
}
