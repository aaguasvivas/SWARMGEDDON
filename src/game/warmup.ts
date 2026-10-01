import { FIXED_DT, XP } from '../config.ts'
import { ARENAS } from '../content/arenas.ts'
import { BONUSES } from '../content/bonuses.ts'
import { CHARACTERS } from '../content/characters.ts'
import { FUSIONS, PERKS } from '../content/perks.ts'
import { WEAPON_LIST } from '../content/weapons.ts'
import type { InputManager } from '../input/input.ts'
import { blastHit } from '../systems/collision.ts'
import { directorJumpTo } from '../systems/director.ts'
import { dropBonus, dropGem, dropHealth, dropPod, dropShard } from '../systems/pickups.ts'
import { runSystems } from './step.ts'
import type { RunConfig, World } from './world.ts'

/** Sim seconds per warm-up step in a boss fight: its states and attacks cycle
 *  in a few steps. Only type feedback is wanted, not a faithful fight. */
const BOSS_DT = 0.1
/** A boss fight's steps, and the share of max HP the boss is set to at the
 *  start of each later stretch: its phases, its death and, for a PRIME, the
 *  win and the purge run too. */
const BOSS_STRETCH = 40
const BOSS_HP_STEPS = [0.6, 0.3, 0.001] as const
const EVENT_DT = 0.05
const EVENT_STEPS = 60
const ELITE_STEPS = 12
const WEAPON_STEPS = 6
const OVERTIME_STEPS = 200
/** Fewer ambient enemies: the beats bring every unit kind anyway. */
const WARM_ALIVE_MUL = 0.15
/** One THREAT per world pass, so each THREAT rule (A11) runs both off and on
 *  across the three passes. The rules act only in code every world shares
 *  (the script, the director, the boss cadence, kill drops), and a mirror
 *  copy only turns its event's angles. */
const WARM_THREAT = [0, 2, 4] as const

/**
 * First-use warm-up (section 3.2). The first time a branch of a per-enemy loop
 * runs, V8 finds no type feedback there and drops the system out of its
 * optimizing tier; it then boxes numbers for many frames until it is optimized
 * again (the first brood unit in a cage, the first slowed enemy, the first
 * stream unit, the first affixed elite, the first boss call). At boot this runs
 * every event, elite and boss beat of each world (Hive at THREAT 0, Depths at
 * 2, Wastes at 4), the start of OVERTIME, every weapon, bonus and pickup kind,
 * the full build and dashes on `w`, a scratch World that shares no state with
 * the real one, so a real run meets none of those branches for the first time.
 * Each step runs stepSim's `runSystems`, and `draw` runs after it, so the
 * render pass over the pools meets the same states. `input` is the real input
 * manager (disabled at boot): its fire, aim and move fields are restored after.
 */
export function warmSystems(w: World, cfg: RunConfig, input: InputManager, draw: (w: World) => void): void {
  const firing = input.firing
  const ax = input.aimDir.x
  const ay = input.aimDir.y
  const mx = input.move.x
  const my = input.move.y
  input.setEnabled(true)
  input.firing = true
  for (let a = 0; a < ARENAS.length; a++) {
    const run: RunConfig = {
      ...cfg,
      seed: 0x5eed + a,
      theme: ARENAS[a]!,
      character: CHARACTERS[a % CHARACTERS.length]!,
      threat: WARM_THREAT[a % WARM_THREAT.length]!,
    }
    begin(w, run)
    for (let i = 0; i < w.script.beats.length; i++) {
      const b = w.script.beats[i]!
      if (b.kind !== 'event' && b.kind !== 'elite' && b.kind !== 'boss') continue
      begin(w, run)
      directorJumpTo(w, b.at - 0.05)
      if (b.kind === 'boss') {
        steps(w, input, draw, BOSS_STRETCH, BOSS_DT)
        for (let k = 0; k < BOSS_HP_STEPS.length; k++) {
          const boss = w.boss
          if (boss && boss.alive) boss.hp = Math.max(1, boss.maxHp * BOSS_HP_STEPS[k]!)
          steps(w, input, draw, BOSS_STRETCH, BOSS_DT)
        }
      } else if (b.kind === 'event') steps(w, input, draw, EVENT_STEPS, EVENT_DT)
      else {
        // The elites arrive, then die: shards, pods, bonuses and the affix death hooks.
        steps(w, input, draw, ELITE_STEPS, FIXED_DT)
        const es = w.enemies.active
        for (let k = 0; k < es.length; k++) if (es[k]!.alive && es[k]!.def.elite) blastHit(w, es[k]!, es[k]!.hp + 1, false)
        steps(w, input, draw, ELITE_STEPS, FIXED_DT)
      }
    }
    begin(w, run)
    directorJumpTo(w, w.script.beats[w.script.beats.length - 1]!.at + 1)
    w.startOvertime()
    w.aliveMul = WARM_ALIVE_MUL
    steps(w, input, draw, OVERTIME_STEPS, BOSS_DT)
    begin(w, run)
    directorJumpTo(w, 300)
    const pl = w.player
    for (let k = 0; k < BONUSES.length; k++) {
      dropBonus(w, pl.x, pl.y, k)
      steps(w, input, draw, 3, FIXED_DT)
    }
    dropShard(w, pl.x, pl.y)
    dropHealth(w, pl.x, pl.y, 10)
    dropPod(w, pl.x, pl.y)
    // Past the gem cap the farthest gem becomes the bank gem.
    for (let k = 0; k <= XP.gemSoftCap; k++) dropGem(w, pl.x + 400, pl.y, 1)
    steps(w, input, draw, 30, FIXED_DT)
    for (let k = 0; k < WEAPON_LIST.length; k++) {
      w.equipWeapon(WEAPON_LIST[k]!.id)
      steps(w, input, draw, WEAPON_STEPS, FIXED_DT)
    }
  }
  input.setEnabled(false)
  input.firing = firing
  input.aimDir.x = ax
  input.aimDir.y = ay
  input.move.x = mx
  input.move.y = my
}

function begin(w: World, run: RunConfig): void {
  w.beginRun(run)
  for (let i = 0; i < PERKS.length; i++) w.choosePerk(PERKS[i]!.id)
  for (let i = 0; i < FUSIONS.length; i++) w.choosePerk(FUSIONS[i]!.id)
  w.aliveMul = WARM_ALIVE_MUL
}

/** `n` sim steps of `dt`, the ship circling, dashing and firing at the
 *  nearest enemy. */
function steps(w: World, input: InputManager, draw: (w: World) => void, n: number, dt: number): void {
  const pl = w.player
  for (let i = 0; i < n; i++) {
    pl.hp = pl.maxHp
    const ang = w.time * 1.7
    input.move.x = Math.cos(ang)
    input.move.y = Math.sin(ang)
    const es = w.enemies.active
    let best = -1
    let bd = Infinity
    for (let k = 0; k < es.length; k++) {
      const d2 = (es[k]!.x - pl.x) ** 2 + (es[k]!.y - pl.y) ** 2
      if (d2 < bd) {
        bd = d2
        best = k
      }
    }
    if (best >= 0) {
      const d = Math.sqrt(bd) || 1
      input.aimDir.x = (es[best]!.x - pl.x) / d
      input.aimDir.y = (es[best]!.y - pl.y) / d
    }
    if (i % 20 === 0) input.pressDash()
    w.time += dt
    runSystems(w, input, dt)
    draw(w)
    // Nothing drains the scratch run's queue or opens its hand-offs.
    w.feel.clear()
    w.pendingLevelUps = 0
    w.pendingGameOver = false
  }
}
