// Playtest run configs: the one parser for a config string and the one name
// for a run's output file (playtest.mjs writes it, matrix.mjs looks for it).
//
// Config string: <mode[+dash][+focus][+nostream]>:<seed>[:minutes[:char[:perkPolicy[:threat[:ot]]]]]
//   minutes defaults to 14; threat 0..4; ot = 'ot' to push into OVERTIME after a win.

export function parseConfig(s) {
  const [modeTok, seed, min, char, perkPolicy, threat, ot] = s.split(':')
  const [mode, ...opts] = modeTok.split('+')
  return {
    mode,
    dash: opts.includes('dash'),
    focus: opts.includes('focus'),
    noStreamDodge: opts.includes('nostream'),
    seed: parseInt(seed),
    minutes: min ? parseFloat(min) : 14,
    char: char || 'nova',
    perkPolicy: perkPolicy || 'first',
    threat: threat ? parseInt(threat) : 0,
    ot: ot === 'ot',
  }
}

/** The run's output file name. The run length is not part of it: a run of the
 *  same config at another length overwrites it (matrix.mjs checks cfg.minutes). */
export function runFile(arena, c) {
  return `${arena}_${c.mode}${c.dash ? '_dash' : ''}${c.focus ? '_focus' : ''}${c.noStreamDodge ? '_nostream' : ''}_${c.seed}${c.char !== 'nova' ? '_' + c.char : ''}${c.perkPolicy !== 'first' ? '_' + c.perkPolicy : ''}${c.threat ? '_t' + c.threat : ''}${c.ot ? '_ot' : ''}.json`
}
