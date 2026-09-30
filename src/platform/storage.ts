import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'

/**
 * The single choke point for client-side persistence. Reads and writes are
 * synchronous over an in-memory Map that `initStorage()` hydrates, so boot must
 * await `initStorage()` before the first `loadJSON`.
 *
 * Web: the Map writes through to localStorage.
 * Native: the Map writes through to Capacitor Preferences, because iOS may purge
 * WKWebView localStorage under storage pressure. The first native launch copies
 * the web save once and never deletes it.
 *
 * Every backend call is guarded: a disabled or full store (private mode, quota)
 * degrades to an in-memory session and never throws into gameplay.
 */
const PREFIX = 'swarmgeddon:'
const NATIVE_MARKER = 'storage:native'

/** Unprefixed key -> raw JSON text. */
const mem = new Map<string, string>()
let native = false

// Native write-through. `queued` holds the newest value not yet handed to the
// plugin (null = remove), so a burst of saves to one key (a slider drag)
// coalesces into one write; `chains` keeps the writes to one key in order.
const queued = new Map<string, string | null>()
const chains = new Map<string, Promise<void>>()
let nativeWriteFailures = 0

export async function initStorage(): Promise<void> {
  mem.clear()
  native = Capacitor.isNativePlatform()
  if (native) {
    try {
      await hydrateNative()
      return
    } catch {
      // Preferences is unusable in this shell: run the session on localStorage.
      mem.clear()
      native = false
    }
  }
  hydrateWeb()
  window.addEventListener('storage', onOtherTabWrite)
}

export function loadJSON<T>(key: string, fallback: T): T {
  const raw = mem.get(key)
  if (raw === undefined) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function saveJSON(key: string, value: unknown): void {
  let raw: string | undefined
  try {
    raw = JSON.stringify(value)
  } catch {
    return
  }
  if (raw === undefined) {
    removeKey(key)
    return
  }
  mem.set(key, raw)
  persist(key, raw)
}

export function removeKey(key: string): void {
  mem.delete(key)
  persist(key, null)
}

/** Unprefixed keys that start with `prefix`. */
export function keysWithPrefix(prefix: string): string[] {
  const out: string[] = []
  for (const k of mem.keys()) if (k.startsWith(prefix)) out.push(k)
  return out
}

/** Resolves once every queued native write has reached the plugin. */
export async function flushStorage(): Promise<void> {
  while (chains.size > 0) await Promise.all(chains.values())
}

function persist(key: string, raw: string | null): void {
  if (!native) {
    try {
      if (raw === null) localStorage.removeItem(PREFIX + key)
      else localStorage.setItem(PREFIX + key, raw)
    } catch {
      // storage blocked or full: the Map still serves this session
    }
    return
  }
  const pending = queued.has(key)
  queued.set(key, raw)
  if (pending) return
  const chain = (chains.get(key) ?? Promise.resolve()).then(() => writeNative(key))
  chains.set(key, chain)
  void chain.then(() => {
    if (chains.get(key) === chain) chains.delete(key)
  })
}

async function writeNative(key: string): Promise<void> {
  const raw = queued.get(key)
  queued.delete(key)
  if (raw === undefined) return
  try {
    if (raw === null) await Preferences.remove({ key: PREFIX + key })
    else await Preferences.set({ key: PREFIX + key, value: raw })
  } catch {
    nativeWriteFailures++
  }
}

async function hydrateNative(): Promise<void> {
  const { keys } = await Preferences.keys()
  const own = keys.filter((k) => k.startsWith(PREFIX))
  const got = await Promise.all(own.map(async (k) => [k, (await Preferences.get({ key: k })).value] as const))
  for (const [k, v] of got) if (v !== null) mem.set(k.slice(PREFIX.length), v)
  if (mem.has(NATIVE_MARKER)) return

  // First native launch: adopt the web save. A key Preferences already holds
  // wins, since only an interrupted earlier copy or a later native write can
  // have put it there. The marker goes in only after every copy landed, so a
  // failed or interrupted copy is retried on the next launch.
  const failuresBefore = nativeWriteFailures
  for (const [k, v] of readWebSave()) {
    if (mem.has(k)) continue
    mem.set(k, v)
    persist(k, v)
  }
  await flushStorage()
  if (nativeWriteFailures === failuresBefore) saveJSON(NATIVE_MARKER, true)
}

function hydrateWeb(): void {
  for (const [k, v] of readWebSave()) mem.set(k, v)
}

function readWebSave(): [string, string][] {
  const out: [string, string][] = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k === null || !k.startsWith(PREFIX)) continue
      const v = localStorage.getItem(k)
      if (v !== null) out.push([k.slice(PREFIX.length), v])
    }
  } catch {
    // storage blocked: there is no web save to read
  }
  return out
}

// Another tab of the game wrote the save. Keep this tab's Map current, so its
// next write never rolls back the other tab's progress.
function onOtherTabWrite(e: StorageEvent): void {
  if (e.key === null) {
    mem.clear()
    hydrateWeb()
    return
  }
  if (!e.key.startsWith(PREFIX)) return
  const k = e.key.slice(PREFIX.length)
  if (e.newValue === null) mem.delete(k)
  else mem.set(k, e.newValue)
}
