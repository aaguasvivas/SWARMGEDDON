import type { InputManager } from '../input/input.ts'
import { acidSystem } from '../systems/acid.ts'
import { aiSystem, buildEnemyHash } from '../systems/ai.ts'
import { bonusSystem } from '../systems/bonuses.ts'
import { collisionSystem } from '../systems/collision.ts'
import { healPlayer, playerSpeedMul } from '../systems/damage.ts'
import { dashSystem } from '../systems/dash.ts'
import { clampPlayerToCage, directorTick } from '../systems/director.ts'
import { hazardsTick } from '../systems/hazards.ts'
import { particleSystem } from '../systems/particles.ts'
import { pickupSystem } from '../systems/pickups.ts'
import { enemyProjectileSystem, projectileSystem } from '../systems/projectiles.ts'
import { weaponSystem } from '../systems/weapons.ts'
import { scoreStep } from './scoring.ts'
import type { World } from './world.ts'

/**
 * One sim tick's systems in section 4.1's order, from the director to the
 * sweeps, after the caller advances the time and samples the input. stepSim
 * and the boot warm-up both run it, so the warm-up covers every system a run
 * steps.
 */
export function runSystems(w: World, input: InputManager, dt: number): void {
  directorTick(w, dt)
  buildEnemyHash(w)
  aiSystem(w, dt)
  dashSystem(w, input, dt)
  weaponSystem(w, dt, input)
  projectileSystem(w, dt)
  enemyProjectileSystem(w, dt)
  pickupSystem(w, dt)
  bonusSystem(w, dt)
  collisionSystem(w, dt)
  hazardsTick(w, dt)
  acidSystem(w, dt)
  scoreStep(w, dt)
  particleSystem(w, dt)
  w.player.update(dt, input.move, input.aimDir, w.arena.bounds, playerSpeedMul(w), w.pullX, w.pullY)
  clampPlayerToCage(w)
  if (w.mods.regenPerSec > 0) healPlayer(w, w.mods.regenPerSec * dt)
  sweepPools(w)
}

export function sweepPools(w: World): void {
  w.enemies.sweep()
  w.projectiles.sweep()
  w.enemyProjectiles.sweep()
  w.particles.sweep()
  w.pickups.sweep()
  w.acid.sweep()
  w.hazards.sweep()
}
