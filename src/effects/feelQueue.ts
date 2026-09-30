/**
 * The one channel from the sim to presentation. The sim only calls `emit`;
 * FeelDirector drains the queue once per render frame, then clears it. Nothing
 * here feeds back into the sim, so what presentation does with an event can
 * never change a run.
 */
export const enum FeelKind {
  Shot = 1 /* a = aim angle, b = weapon index */,
  Hit /* x = damage number anchor (fx jitter applied), a = damage, b = enemy uid, ref = enemy */,
  Kill /* a, b = killing projectile vx, vy (0, 0 for thorns); ref = EnemyDef */, Explosion /* a = radius */,
  PlayerHurt /* x, y = source, a = HP removed */, PlayerDeath, Revive, LevelUp /* a = new level */,
  GemCollect /* a = xp */, HealCollect /* a = HP gained */,
  WeaponPickup /* b = weapon index */, WeaponEmpty /* b = weapon index */, LowAmmo /* a = rounds left */,
  PodSpawn /* b = weapon index */, EliteSpawn, BossSpawn, BossPhase, BossFrenzy, BossKill,
  ChargerWindup, EnemyShot, Teleport, Dash, CloseCall, Alert /* b = RunAlert ring index */,
  MultUp /* a = tier */, MultDown, ChainHit, Fusion /* b = fusion index */, Evolve /* b = weapon index */,
  CoreOpen /* a = levels */, Shard, BonusPickup /* b = bonus index */, BonusEnd, HazardDetonate, Win, Stalemate,
}

export const FF_CRIT = 1, FF_ELITE = 2, FF_BOSS = 4, FF_AOE = 8, FF_DISCRETE = 16, FF_CONTACT = 32, FF_ACID = 64, FF_RAM = 128

export const FEEL_CAP = 1024
/** The last slots are kept for rare events: chaff kinds are refused there. */
const CHAFF_RESERVE = 64

export class FeelQueue {
  readonly kind = new Uint8Array(FEEL_CAP)
  readonly flags = new Uint8Array(FEEL_CAP)
  readonly x = new Float32Array(FEEL_CAP)
  readonly y = new Float32Array(FEEL_CAP)
  readonly a = new Float32Array(FEEL_CAP)
  readonly b = new Float32Array(FEEL_CAP)
  readonly ref: (object | null)[] = new Array<object | null>(FEEL_CAP).fill(null)
  n = 0

  emit(kind: FeelKind, flags: number, x: number, y: number, a = 0, b = 0, ref: object | null = null): void {
    const i = this.n
    if (i >= FEEL_CAP) return
    if (
      i >= FEEL_CAP - CHAFF_RESERVE &&
      (kind === FeelKind.Hit || kind === FeelKind.Shot || kind === FeelKind.EnemyShot || kind === FeelKind.GemCollect)
    ) {
      return
    }
    this.kind[i] = kind
    this.flags[i] = flags
    this.x[i] = x
    this.y[i] = y
    this.a[i] = a
    this.b[i] = b
    this.ref[i] = ref
    this.n = i + 1
  }

  clear(): void {
    const r = this.ref
    for (let i = 0; i < this.n; i++) r[i] = null
    this.n = 0
  }
}

export const enum AlertKind { Boss = 1, Final, Event, Elite, Lull, Debut }

export class RunAlert {
  kind = 0
  title = ''
  sub = ''
  dirX = 0
  dirY = 0
  t = 0
  seq = 0
}

export const RUN_ALERT_SLOTS = 6

/** Preallocated alert strings. An `Alert` event carries only the slot index,
 *  so the queue itself never holds a string. */
export class RunAlertRing {
  readonly slots: RunAlert[] = []
  seq = 0

  constructor() {
    for (let i = 0; i < RUN_ALERT_SLOTS; i++) this.slots.push(new RunAlert())
  }

  push(q: FeelQueue, kind: AlertKind, title: string, sub: string, dirX: number, dirY: number, t: number, x: number, y: number): void {
    const i = this.seq % RUN_ALERT_SLOTS
    const s = this.slots[i]!
    s.kind = kind
    s.title = title
    s.sub = sub
    s.dirX = dirX
    s.dirY = dirY
    s.t = t
    s.seq = this.seq++
    q.emit(FeelKind.Alert, 0, x, y, 0, i)
  }

  reset(): void {
    this.seq = 0
  }
}
