import { DRAFT, FALLBACK } from '../config.ts'
import { SALT, hash32, type Rng } from '../core/rng.ts'
import {
  FALLBACKS,
  FAMILIES,
  FAMILY_KEYSTONES,
  FAMILY_OF_PILOT,
  FUSIONS,
  findPerk,
  perkStat,
  powi,
  x2,
  type FallbackDef,
  type FusionDef,
  type PerkDef,
} from '../content/perks.ts'
import { PICKUP_WEAPON_IDS, WEAPONS, type WeaponDef } from '../content/weapons.ts'
import type { World } from '../game/world.ts'

/**
 * The level-up draft (section 4.4): Keystone draft, BUILD / FAMILY / WILD
 * slots, reroll, banish, skip and fallbacks. Every roll reseeds the draft
 * stream from (seed, draft index, reroll index, banish count), so rerolls and
 * banishes never move another stream. Cards are rolled once per open and
 * cached in `DraftState.cards` until the draft closes.
 */

export const TAG_NEW = 1
export const TAG_KEYSTONE = 2
export const TAG_FUSION_FIRST = 4
export const TAG_COMPLETES_FUSION = 8
export const TAG_PAIRS_WEAPON = 16
export const TAG_EVOLVES_HELD = 32

export type CardKind = 'perk' | 'fusion' | 'fallback'
export type CardRarity = 'common' | 'rare' | 'fusion' | 'fallback'

export class DraftCard {
  id = ''
  kind: CardKind = 'perk'
  name = ''
  rarity: CardRarity = 'common'
  /** FAMILIES index, or -1 for fusions and fallbacks. */
  family = -1
  keystone = false
  /** Stacks owned before this pick. */
  stacks = 0
  max = 0
  stat = ''
  desc = ''
  glyph = ''
  tags = 0
  /** The card's single tag line (evolution, fusion or weapon pair), or ''. */
  tagText = ''
}

const FUSION_LOCKED = 0
const FUSION_ELIGIBLE = 1
const FUSION_OFFERED = 2

export class DraftState {
  /** Drafts opened this run; the first one is the Keystone draft. */
  index = 0
  rerollIndex = 0
  /** Banishes used this run. */
  banishSeq = 0
  rerolls: number = DRAFT.startRerolls
  banishes: number = DRAFT.startBanishes
  /** Sim time the last draft opened; the next opens DRAFT.minGap later. */
  lastOpenAt = 0
  /** Drafts closed in a row that showed no rare card (the rarity pity). */
  sinceRare = 0
  open = false
  count = 0
  readonly cards = [new DraftCard(), new DraftCard(), new DraftCard()]
  readonly banned = new Set<string>()
  /** Per FUSIONS entry: 0 locked, 1 eligible and never offered, 2 offered. */
  readonly fusionState = new Uint8Array(FUSIONS.length)

  reset(): void {
    this.index = 0
    this.rerollIndex = 0
    this.banishSeq = 0
    this.rerolls = DRAFT.startRerolls
    this.banishes = DRAFT.startBanishes
    this.lastOpenAt = 0
    this.sinceRare = 0
    this.open = false
    this.count = 0
    this.banned.clear()
    this.fusionState.fill(FUSION_LOCKED)
  }
}

/** Whether a draft may open now (section 4.4 open rule; the caller checks
 *  pauses). The first draft waits for DRAFT.firstOpenAt, later ones for the gap. */
export function draftDue(w: World): boolean {
  if (w.pendingLevelUps <= 0 || w.pendingGameOver) return false
  const d = w.draft
  return d.index === 0 ? w.time >= DRAFT.firstOpenAt : w.time - d.lastOpenAt >= DRAFT.minGap
}

/** Open the next draft and roll its cards. Returns the card count. */
export function openDraft(w: World): number {
  const d = w.draft
  d.index++
  d.rerollIndex = 0
  d.lastOpenAt = w.time
  d.open = true
  d.count = 0
  rollAll(w, false)
  return d.count
}

/** Re-roll the whole draft. False when no reroll is left. */
export function rerollDraft(w: World): boolean {
  const d = w.draft
  if (!d.open || d.rerolls <= 0) return false
  d.rerolls--
  d.rerollIndex++
  rollAll(w, true)
  return true
}

/** Ban card `i`'s id for the run and re-roll only that slot. Fallback cards
 *  cannot be banished (they are what keeps a draft from ever being empty). */
export function banishCard(w: World, i: number): boolean {
  const d = w.draft
  if (!d.open || d.banishes <= 0 || i < 0 || i >= d.count) return false
  const c = d.cards[i]!
  if (c.kind === 'fallback') return false
  d.banishes--
  d.banishSeq++
  d.banned.add(c.id)
  const rng = reseed(w)
  prepare(w)
  taken.length = 0
  for (let k = 0; k < d.count; k++) if (k !== i) taken.push(d.cards[k]!.id)
  prevN = 0
  const ok = d.index === 1 ? keystoneSlot(w, rng, i, c.family) : rollSlot(w, rng, i, i)
  if (!ok) fillFallback(w, i)
  return true
}

/** Take card `i`. */
export function pickCard(w: World, i: number): void {
  const d = w.draft
  if (!d.open || i < 0 || i >= d.count) return
  const c = d.cards[i]!
  if (c.kind === 'fallback') applyFallback(w, c.id)
  else w.choosePerk(c.id)
  w.pendingLevelUps--
  closeDraft(w)
}

/** Take perk `id` whatever the cards show (the harness forced picks). */
export function pickPerkId(w: World, id: string): void {
  if (!w.draft.open) return
  w.choosePerk(id)
  w.pendingLevelUps--
  closeDraft(w)
}

/** Take no card: heal DRAFT.skipHealFrac of max HP instead. */
export function skipDraft(w: World): void {
  if (!w.draft.open) return
  const pl = w.player
  pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * DRAFT.skipHealFrac)
  w.pendingLevelUps--
  closeDraft(w)
}

function closeDraft(w: World): void {
  const d = w.draft
  let rare = false
  for (let k = 0; k < d.count; k++) if (d.cards[k]!.rarity === 'rare') rare = true
  d.sinceRare = rare ? 0 : d.sinceRare + 1
  d.open = false
}

function applyFallback(w: World, id: string): void {
  if (id === 'sharpen') {
    w.choosePerk('sharpen')
  } else if (id === 'field_repair') {
    const pl = w.player
    pl.hp = Math.min(pl.maxHp, pl.hp + pl.maxHp * FALLBACK.repairFrac)
  } else {
    w.draft.rerolls = Math.min(DRAFT.maxRerolls, w.draft.rerolls + 1)
  }
}

// --- rolling ----------------------------------------------------------------

/** Eligible perks of this roll: in the run's pool, not maxed, not banned. */
const elig: PerkDef[] = []
/** Candidate scratch for one slot. */
const cand: PerkDef[] = []
const fcand: FusionDef[] = []
const weights: number[] = []
/** Ids already on the other cards of this draft. */
const taken: string[] = []
/** Ids shown before a reroll (excluded when enough others remain). */
const prev: string[] = []
let prevN = 0
const ownedDistinct = new Int8Array(FAMILIES.length)
const famPick: number[] = []

function reseed(w: World): Rng {
  const d = w.draft
  const rng = w.rngs.draft
  rng.reseed(hash32(w.seed, SALT.draft, d.index * 64 + d.rerollIndex, d.banishSeq))
  return rng
}

function stacksOf(w: World, id: string): number {
  return w.perkStacks.get(id) ?? 0
}

function isTaken(id: string): boolean {
  for (let k = 0; k < taken.length; k++) if (taken[k] === id) return true
  return false
}

function isPrev(id: string): boolean {
  for (let k = 0; k < prevN; k++) if (prev[k] === id) return true
  return false
}

/** Fusion unlocks (state 0 to 1), the eligible perk set and family counts. */
function prepare(w: World): void {
  const d = w.draft
  for (let k = 0; k < FUSIONS.length; k++) {
    const f = FUSIONS[k]!
    if (d.fusionState[k] === FUSION_LOCKED && stacksOf(w, f.a) > 0 && stacksOf(w, f.b) > 0) d.fusionState[k] = FUSION_ELIGIBLE
  }
  elig.length = 0
  ownedDistinct.fill(0)
  const pool = w.perkPool
  for (let k = 0; k < pool.length; k++) {
    const p = pool[k]!
    const s = stacksOf(w, p.id)
    if (s > 0) ownedDistinct[p.family]!++
    if (s < p.max && !d.banned.has(p.id)) elig.push(p)
  }
}

function rollAll(w: World, reroll: boolean): void {
  const d = w.draft
  prevN = 0
  if (reroll) for (let k = 0; k < d.count; k++) prev[prevN++] = d.cards[k]!.id
  const rng = reseed(w)
  prepare(w)
  // A reroll excludes what was just shown only while 3 other entries remain.
  if (prevN > 0) {
    let others = 0
    for (let k = 0; k < elig.length; k++) if (!isPrev(elig[k]!.id)) others++
    if (others < 3) prevN = 0
  }
  d.count = 3
  taken.length = 0
  if (d.index === 1) {
    keystoneDraft(w, rng)
  } else {
    for (let slot = 0; slot < 3; slot++) {
      if (!rollSlot(w, rng, slot, slot)) fillFallback(w, slot)
      taken.push(d.cards[slot]!.id)
    }
  }
}

/** Slot rule `rule` (0 BUILD, 1 FAMILY, 2 WILD) into card `slot`. */
function rollSlot(w: World, rng: Rng, slot: number, rule: number): boolean {
  if (rule === 0) {
    const d = w.draft
    // An eligible fusion never offered before, first in A3 order.
    for (let k = 0; k < FUSIONS.length; k++) {
      const f = FUSIONS[k]!
      if (d.fusionState[k] !== FUSION_ELIGIBLE || !fusionOpen(w, f)) continue
      d.fusionState[k] = FUSION_OFFERED
      setFusionCard(d.cards[slot]!, f, TAG_FUSION_FIRST)
      return true
    }
    fcand.length = 0
    for (let k = 0; k < FUSIONS.length; k++) {
      const f = FUSIONS[k]!
      if (d.fusionState[k] === FUSION_OFFERED && fusionOpen(w, f)) fcand.push(f)
    }
    if (fcand.length > 0 && rng.float() < DRAFT.fusionRepeat) {
      setFusionCard(d.cards[slot]!, rng.pick(fcand), 0)
      return true
    }
    cand.length = 0
    for (let k = 0; k < elig.length; k++) {
      const p = elig[k]!
      if (stacksOf(w, p.id) > 0 && free(p.id)) cand.push(p)
    }
    if (cand.length > 0 && rng.float() < DRAFT.ownedBias) {
      setPerkCard(w, w.draft.cards[slot]!, rng.pick(cand), 0)
      return true
    }
    return familySlot(w, rng, slot)
  }
  if (rule === 1) return familySlot(w, rng, slot)
  const rare = rng.float() < rarePity(w)
  if (!gather(rare)) return false
  setPerkCard(w, w.draft.cards[slot]!, rng.pick(cand), 0)
  return true
}

function rarePity(w: World): number {
  return Math.min(DRAFT.rareMax, DRAFT.rareBase + DRAFT.rareStep * w.draft.sinceRare)
}

/** Open for this slot: not on another card and not just shown before a reroll. */
function free(id: string): boolean {
  return !isTaken(id) && !isPrev(id)
}

function fusionOpen(w: World, f: FusionDef): boolean {
  return stacksOf(w, f.id) === 0 && !w.draft.banned.has(f.id) && free(f.id)
}

/** Candidates of the rolled rarity, or of the other one when it is empty. */
function gather(rare: boolean): boolean {
  for (let pass = 0; pass < 2; pass++) {
    const want = pass === 0 ? rare : !rare
    cand.length = 0
    for (let k = 0; k < elig.length; k++) {
      const p = elig[k]!
      if ((p.rarity === 'rare') === want && free(p.id)) cand.push(p)
    }
    if (cand.length > 0) return true
  }
  return false
}

function familySlot(w: World, rng: Rng, slot: number): boolean {
  const rare = rng.float() < rarePity(w)
  if (!gather(rare)) return false
  weights.length = 0
  let total = 0
  for (let k = 0; k < cand.length; k++) {
    const wt = Math.min(DRAFT.familyMax, 1 + DRAFT.familyStep * ownedDistinct[cand[k]!.family]!)
    weights.push(wt)
    total += wt
  }
  let r = rng.float() * total
  let pickIdx = cand.length - 1
  for (let k = 0; k < cand.length; k++) {
    r -= weights[k]!
    if (r < 0) {
      pickIdx = k
      break
    }
  }
  setPerkCard(w, w.draft.cards[slot]!, cand[pickIdx]!, 0)
  return true
}

// --- the Keystone draft -----------------------------------------------------

function keystoneDraft(w: World, rng: Rng): void {
  const d = w.draft
  const pf = FAMILY_OF_PILOT[w.character.id] ?? -1
  famPick.length = 0
  if (pf >= 0) famPick.push(pf)
  while (famPick.length < 3) {
    const f = rng.int(0, FAMILIES.length - 1)
    if (!famPick.includes(f)) famPick.push(f)
  }
  for (let slot = 0; slot < 3; slot++) {
    if (!keystoneOf(w, rng, slot, famPick[slot]!)) fillFallback(w, slot)
    taken.push(d.cards[slot]!.id)
  }
  // Shuffle so the pilot family is not always the first card.
  for (let k = 2; k > 0; k--) {
    const j = rng.int(0, k)
    if (j === k) continue
    const t = d.cards[k]!
    d.cards[k] = d.cards[j]!
    d.cards[j] = t
  }
}

/** A keystone of family `f` into `slot`; any other family's keystone when `f` has none left. */
function keystoneOf(w: World, rng: Rng, slot: number, f: number): boolean {
  if (keystoneCands(f)) {
    setPerkCard(w, w.draft.cards[slot]!, rng.pick(cand), TAG_KEYSTONE)
    return true
  }
  return keystoneAny(w, rng, slot)
}

/** Banish in the Keystone draft: the pilot family stays represented, other
 *  slots take a keystone of a family no other card shows. */
function keystoneSlot(w: World, rng: Rng, slot: number, bannedFamily: number): boolean {
  const pf = FAMILY_OF_PILOT[w.character.id] ?? -1
  if (bannedFamily === pf && keystoneCands(pf)) {
    setPerkCard(w, w.draft.cards[slot]!, rng.pick(cand), TAG_KEYSTONE)
    return true
  }
  famPick.length = 0
  for (let f = 0; f < FAMILIES.length; f++) {
    if (f === bannedFamily) continue
    let shown = false
    for (let k = 0; k < w.draft.count; k++) if (k !== slot && w.draft.cards[k]!.family === f) shown = true
    if (!shown && keystoneCands(f)) famPick.push(f)
  }
  if (famPick.length > 0) return keystoneOf(w, rng, slot, rng.pick(famPick))
  return keystoneAny(w, rng, slot)
}

/** Eligible keystones of family `f` into `cand`. A family that would be left
 *  empty ignores the reroll exclusion, so the pilot family always shows. */
function keystoneCands(f: number): boolean {
  const ks = FAMILY_KEYSTONES[f]!
  for (let pass = 0; pass < 2; pass++) {
    cand.length = 0
    for (let k = 0; k < ks.length; k++) {
      const p = ks[k]!
      if (isTaken(p.id) || (pass === 0 && isPrev(p.id))) continue
      if (!eligible(p)) continue
      cand.push(p)
    }
    if (cand.length > 0) return true
  }
  return false
}

function keystoneAny(w: World, rng: Rng, slot: number): boolean {
  cand.length = 0
  for (let k = 0; k < elig.length; k++) {
    const p = elig[k]!
    if (p.keystone && !isTaken(p.id)) cand.push(p)
  }
  if (cand.length === 0) return false
  setPerkCard(w, w.draft.cards[slot]!, rng.pick(cand), TAG_KEYSTONE)
  return true
}

function eligible(p: PerkDef): boolean {
  for (let k = 0; k < elig.length; k++) if (elig[k] === p) return true
  return false
}

// --- cards ------------------------------------------------------------------

/** The first fallback no other card shows. `taken` holds the other cards. */
function fillFallback(w: World, slot: number): void {
  for (let k = 0; k < FALLBACKS.length; k++) {
    const fb = FALLBACKS[k]!
    if (!isTaken(fb.id)) {
      setFallbackCard(w, w.draft.cards[slot]!, fb)
      return
    }
  }
}

function upper(s: string): string {
  return s.toUpperCase()
}

/** "a → b" with the shared words kept once: `fire rate x1.28 → x1.42`. */
export function arrowStat(a: string, b: string): string {
  let p = 0
  while (p < a.length && p < b.length && a[p] === b[p]) p++
  while (p > 0 && a[p - 1] !== ' ') p--
  let r = 0
  while (r < a.length - p && r < b.length - p && a[a.length - 1 - r] === b[b.length - 1 - r]) r++
  let j = a.length - r
  while (j < a.length && a[j] !== ' ') j++
  if (j < a.length && a[j - 1] === ',') j--
  const q = a.length - j
  return a.slice(0, a.length - q) + ' → ' + b.slice(p, b.length - q) + a.slice(a.length - q)
}

/** The held pickup weapon, or null on the pilot's base weapon. */
function heldPickup(w: World): WeaponDef | null {
  return w.weapon.id === w.baseWeaponId ? null : w.weapon
}

function pairedWeapon(perkId: string): WeaponDef | null {
  for (let k = 0; k < PICKUP_WEAPON_IDS.length; k++) {
    const wd = WEAPONS[PICKUP_WEAPON_IDS[k]!]!
    if (wd.pair === perkId) return wd
  }
  return null
}

function setPerkCard(w: World, c: DraftCard, p: PerkDef, tags: number): void {
  const s = stacksOf(w, p.id)
  c.id = p.id
  c.kind = 'perk'
  c.name = p.name
  c.rarity = p.rarity
  c.family = p.family
  c.keystone = p.keystone
  c.stacks = s
  c.max = p.max
  c.stat = s === 0 ? perkStat(p, 1) : arrowStat(perkStat(p, s), perkStat(p, s + 1))
  c.desc = p.desc
  c.glyph = p.glyph
  c.tags = tags | (s === 0 ? TAG_NEW : 0)
  c.tagText = ''
  const held = heldPickup(w)
  if (held && held.pair === p.id && held.evolvesTo && s + 1 === 2) {
    c.tags |= TAG_EVOLVES_HELD
    c.tagText = `EVOLVES ${upper(held.name)} AT THE NEXT HIVE CORE`
    return
  }
  if (s === 0) {
    for (let k = 0; k < FUSIONS.length; k++) {
      const f = FUSIONS[k]!
      const other = f.a === p.id ? f.b : f.b === p.id ? f.a : ''
      if (other === '' || stacksOf(w, other) === 0 || stacksOf(w, f.id) > 0) continue
      c.tags |= TAG_COMPLETES_FUSION
      c.tagText = `+ ${upper(findPerk(other)!.name)} = ${f.name}`
      return
    }
  }
  const pw = pairedWeapon(p.id)
  if (pw) {
    c.tags |= TAG_PAIRS_WEAPON
    c.tagText = `PAIR: ${upper(pw.name)}`
  }
}

function setFusionCard(c: DraftCard, f: FusionDef, tags: number): void {
  c.id = f.id
  c.kind = 'fusion'
  c.name = f.name
  c.rarity = 'fusion'
  c.family = -1
  c.keystone = false
  c.stacks = 0
  c.max = 1
  c.stat = ''
  c.desc = f.desc
  c.glyph = findPerk(f.a)!.glyph
  c.tags = tags | TAG_NEW
  c.tagText = `${upper(findPerk(f.a)!.name)} + ${upper(findPerk(f.b)!.name)}`
}

function setFallbackCard(w: World, c: DraftCard, fb: FallbackDef): void {
  c.id = fb.id
  c.kind = 'fallback'
  c.name = fb.name
  c.rarity = 'fallback'
  c.family = -1
  c.keystone = false
  c.stacks = stacksOf(w, fb.id)
  c.max = 0
  c.desc = fb.desc
  c.glyph = fb.glyph
  c.tags = 0
  c.tagText = ''
  const pl = w.player
  if (fb.id === 'sharpen') {
    c.stat = `damage x${x2(FALLBACK.sharpenMul)} (total x${x2(powi(FALLBACK.sharpenMul, c.stacks + 1))})`
  } else if (fb.id === 'field_repair') {
    c.stat = `heal ${Math.round(pl.maxHp * FALLBACK.repairFrac)} HP`
  } else {
    const r = w.draft.rerolls
    c.stat = `rerolls ${r} → ${Math.min(DRAFT.maxRerolls, r + 1)}`
  }
}
