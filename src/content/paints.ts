import type { UnlockMeta } from './characters.ts'

/** Ship hull colors. A pilot's own colors and every paint share this shape. */
export interface PaintColors {
  body: number
  outline: number
  visor: number
  barrel: number
}

/**
 * Ship paints (A13). Presentation only: a paint recolors the hull and the
 * pilot's base weapon bullets, and never reaches the sim.
 */
export interface PaintDef extends PaintColors {
  id: string
  name: string
  /** Projectile tint of the pilot's base weapon. */
  bullet: number
  unlock: UnlockMeta
}

/** The pilot's own colors. Always owned, never in PAINTS. */
export const FACTORY_PAINT_ID = 'factory'

function paint(id: string, name: string, body: number, outline: number, visor: number, barrel: number, bullet: number, feat: string): PaintDef {
  return { id, name, body, outline, visor, barrel, bullet, unlock: { how: 'earn', feat } }
}

export const PAINTS: readonly PaintDef[] = [
  paint('static', 'STATIC', 0xe8f4ff, 0x23313f, 0x0b1622, 0x7f9bb5, 0xd6f0ff, 'first_contact'),
  paint('hazard', 'HAZARD', 0xffd23a, 0x3a2a00, 0x1a1300, 0x2b2b2b, 0xffe066, 'swatter'),
  paint('gunmetal', 'GUNMETAL', 0x8a96a3, 0x1b2129, 0x0d1117, 0x4a5561, 0xc9d3dd, 'arsenal'),
  paint('atlas', 'ATLAS', 0x3aa0ff, 0x0a2a4a, 0x04121f, 0xff9a3a, 0x9ad0ff, 'world_tour'),
  paint('cobalt', 'COBALT', 0x3a6bff, 0x0d1a4a, 0x070d26, 0x1f3a99, 0x8fb0ff, 'on_shift'),
  paint('daybreak', 'DAYBREAK', 0xffb3c7, 0x5a1f33, 0x2a0d18, 0xff7aa0, 0xffd6e2, 'daybreak'),
  paint('magma', 'MAGMA', 0xff5a2a, 0x3d0f05, 0x1f0703, 0xffb03a, 0xff8a4a, 'exterminator'),
  paint('bone', 'BONE', 0xf0e6d2, 0x4a3f30, 0x1f1a12, 0xb8a888, 0xfff4e0, 'purist'),
  paint('chrome', 'CHROME', 0xd7dde4, 0x3a424a, 0x11161b, 0x9aa5b0, 0xffffff, 'long_watch'),
  paint('ghost', 'GHOST', 0xcfc4ff, 0x3b3366, 0x17132b, 0x9b8cff, 0xe6e0ff, 'flawless'),
  paint('overclock', 'OVERCLOCK', 0xff4a4a, 0x4a0a0a, 0x220404, 0xffffff, 0xffb0b0, 'fused'),
  paint('nova_prime', 'NOVA PRIME', 0x1ce8b5, 0x0b3b30, 0x06231d, 0xffd24a, 0xfff2b0, 'nova_ace'),
  paint('wildfire', 'WILDFIRE', 0xff7a1a, 0x4a1e08, 0x2b1206, 0xffd23a, 0xffb066, 'ember_ace'),
  paint('nightshade', 'NIGHTSHADE', 0x8a4dff, 0x1f0d40, 0x0e0620, 0x3a1a80, 0xc9a0ff, 'vesper_ace'),
  paint('royal_jelly', 'ROYAL JELLY', 0xff3a8a, 0x4a0a26, 0x240512, 0xffd24a, 0xff9ac4, 'hive_breaker'),
  paint('sunset', 'SUNSET', 0xff6a5a, 0x3a0f1a, 0x1a0610, 0x7a3aff, 0xffb0a0, 'infestation'),
  paint('gilded', 'GILDED', 0xffd24a, 0x5a4000, 0x2a1e00, 0xfff2b0, 0xffe98a, 'high_score'),
  paint('ultraviolet', 'ULTRAVIOLET', 0xb04dff, 0x2a0a4a, 0x14052a, 0xff6cf0, 0xe0a0ff, 'evolved'),
  paint('rust', 'RUST', 0xc0602a, 0x3a1a0a, 0x1a0c05, 0x7a8a8a, 0xe8a070, 'devoted'),
  paint('dusk', 'DUSK', 0xff9a6a, 0x3a1a4a, 0x1a0c24, 0x7a4aff, 0xffc0a0, 'creature_of_habit'),
  paint('tricolor', 'TRICOLOR', 0x1ce8b5, 0x2c1450, 0x14052a, 0xff8a3d, 0xb886ff, 'five_everywhere'),
  paint('ice', 'ICE', 0xa8ecff, 0x1a4a5a, 0x0a2029, 0xffffff, 0xd8f8ff, 'dedicated'),
  paint('purged', 'PURGED', 0x3df0c0, 0xffffff, 0x05070d, 0xffffff, 0xeafff6, 'first_clear'),
  paint('veteran', 'VETERAN', 0x9aa05a, 0x2a2d14, 0x12140a, 0x5a5a3a, 0xe0e6a0, 'veteran'),
  paint('swarmgeddon', 'SWARMGEDDON', 0xffffff, 0xff2d4a, 0x05070d, 0x3df0c0, 0xff6cf0, 'swarmgeddon'),
  paint('sweep', 'CLEAN SWEEP', 0xffffff, 0xffd24a, 0x05070d, 0xffd24a, 0xfff2b0, 'clean_sweep'),
  paint('pressure', 'PRESSURE', 0xff2d4a, 0x1a0005, 0x000000, 0xffd24a, 0xff6a6a, 'under_pressure'),
  paint('apex', 'APEX', 0x1a1a1a, 0xffd24a, 0xffd24a, 0xffd24a, 0xffe98a, 'apex'),
  paint('extinction', 'EXTINCTION', 0x2a2a2a, 0xff2d4a, 0xff2d4a, 0xff2d4a, 0xff2d4a, 'extinction'),
]

export function paintById(id: string): PaintDef | undefined {
  return PAINTS.find((p) => p.id === id)
}
