/**
 * Tiny synchronous key/value persistence over localStorage.
 *
 * This is the single choke point for client-side storage. In Phase 4 the
 * Capacitor Preferences API (async) slots in behind this same module — game
 * code only ever calls loadJSON/saveJSON, never touches localStorage directly.
 * All access is wrapped so a disabled/full storage (private mode, quota) never
 * throws into gameplay.
 */
const PREFIX = 'swarmgeddon:'

export function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value))
  } catch {
    // ignore (storage unavailable / full)
  }
}
