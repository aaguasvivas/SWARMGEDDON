import type { RunResult } from '../state/runResult.ts'
import { characterById } from '../content/characters.ts'
import { arenaById } from '../content/arenas.ts'
import { FONT, T } from '../ui/tokens.ts'

const SEP = ' \u00b7 '
const TAGLINE = 'hold the line \u00b7 drown the hive in ichor'

function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0')
}

function group(v: number): string {
  return Math.floor(v).toLocaleString('en-US')
}

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/**
 * Render a square, alien-hive-styled run summary to a PNG and share it: the Web
 * Share API on mobile (with the image attached), or a download on desktop. All
 * client-side: no upload, no backend.
 */
export async function shareRunCard(result: RunResult): Promise<void> {
  const blob = await renderCard(result)
  if (!blob) return
  const file = new File([blob], 'swarmgeddon-run.png', { type: 'image/png' })

  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare && nav.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: 'SWARMGEDDON',
        text: result.mode === 'daily'
          ? `I scored ${group(result.score)} on SWARMGEDDON Daily #${result.dailyNumber}.`
          : `I survived ${fmtTime(result.time)} and scored ${group(result.score)} in SWARMGEDDON.`,
      })
      return
    } catch {
      // user cancelled or share failed: fall through to download
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'swarmgeddon-run.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function renderCard(result: RunResult): Promise<Blob | null> {
  const S = 1080
  const canvas = document.createElement('canvas')
  canvas.width = S
  canvas.height = S
  const ctx = canvas.getContext('2d')!
  const world = arenaById(result.arena)
  const mono = (px: number, weight = 500): string => `${weight} ${px}px ${FONT.mono}`
  const display = (px: number): string => `900 ${px}px ${FONT.display}`

  ctx.fillStyle = hex(T.bgVoid)
  ctx.fillRect(0, 0, S, S)

  // Ichor blotches in the run's world colors, denser toward the bottom.
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S
    const y = S * 0.35 + Math.random() * S * 0.65
    const r = 20 + Math.random() * 90
    ctx.globalAlpha = 0.05 + Math.random() * 0.1
    ctx.fillStyle = hex(Math.random() < 0.82 ? world.ichorA : world.ichorB)
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  ctx.strokeStyle = hex(T.accentPlayer)
  ctx.globalAlpha = 0.35
  ctx.lineWidth = 6
  ctx.strokeRect(24, 24, S - 48, S - 48)
  ctx.globalAlpha = 1
  ctx.textAlign = 'center'

  ctx.fillStyle = hex(T.accentPlayer)
  ctx.font = display(88)
  ctx.fillText('SWARMGEDDON', S / 2, 170, S - 120)

  const daily = result.mode === 'daily'
  ctx.fillStyle = hex(daily ? T.accentGold : T.textPrimary)
  ctx.font = mono(32, 800)
  ctx.fillText(daily ? `DAILY #${result.dailyNumber}${SEP}${result.ranked ? 'RANKED' : 'PRACTICE'}` : 'STANDARD', S / 2, 236)
  ctx.fillStyle = hex(T.textMuted)
  ctx.font = mono(28)
  const threat = result.threat > 0 ? `${SEP}T${result.threat}` : ''
  ctx.fillText(`${characterById(result.character).name}${SEP}${world.name}${threat}${SEP}LV ${result.level}`, S / 2, 284)
  if (result.cleared) {
    ctx.fillStyle = hex(T.accentGold)
    ctx.font = mono(28, 800)
    ctx.fillText(`CLEARED IN ${fmtTime(result.clearMs / 1000)}`, S / 2, 330)
  }

  ctx.fillStyle = hex(T.accentXp)
  ctx.font = mono(140, 800)
  ctx.fillText(group(result.score), S / 2, 560, S - 120)
  ctx.fillStyle = hex(T.textMuted)
  ctx.font = mono(28, 800)
  ctx.fillText('SCORE', S / 2, 606)

  const stats: [string, string][] = [
    ['TIME', fmtTime(result.time)],
    ['KILLS', group(result.kills)],
    ['PEAK', 'x' + Math.max(1, result.peakTier)],
  ]
  const colW = S / 3
  stats.forEach(([label, val], i) => {
    const cx = colW * i + colW / 2
    ctx.fillStyle = hex(T.textHi)
    ctx.font = mono(64, 800)
    ctx.fillText(val, cx, 770, colW - 40)
    ctx.fillStyle = hex(T.textMuted)
    ctx.font = mono(26, 800)
    ctx.fillText(label, cx, 812)
  })

  ctx.fillStyle = hex(T.textPrimary)
  ctx.font = mono(26)
  ctx.fillText(TAGLINE, S / 2, S - 48)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
