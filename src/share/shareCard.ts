import type { RunResult } from '../state/persistence.ts'
import { characterById } from '../content/characters.ts'
import { arenaById } from '../content/arenas.ts'

function fmtTime(s: number): string {
  const m = Math.floor(s / 60)
  return `${m}:${Math.floor(s % 60).toString().padStart(2, '0')}`
}

/**
 * Render a square, alien-hive-styled run summary to a PNG and share it: the Web
 * Share API on mobile (with the image attached), or a download on desktop. All
 * client-side — no upload, no backend.
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
        text: `I survived ${fmtTime(result.time)} and scored ${result.score} in SWARMGEDDON!`,
      })
      return
    } catch {
      // user cancelled or share failed — fall through to download
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

  // Background.
  ctx.fillStyle = '#06080f'
  ctx.fillRect(0, 0, S, S)

  // Ichor blotches (denser toward the bottom — the floor drowned in gore).
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * S
    const y = S * 0.35 + Math.random() * S * 0.65
    const r = 20 + Math.random() * 90
    ctx.globalAlpha = 0.05 + Math.random() * 0.1
    ctx.fillStyle = Math.random() < 0.82 ? '#4ecb3a' : '#7a2fd6'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalAlpha = 1

  // Border glow.
  ctx.strokeStyle = 'rgba(61,240,192,0.35)'
  ctx.lineWidth = 6
  ctx.strokeRect(24, 24, S - 48, S - 48)

  ctx.textAlign = 'center'

  // Title.
  ctx.fillStyle = '#1ce8b5'
  ctx.font = 'bold 92px ui-monospace, Menlo, monospace'
  ctx.fillText('SWARMGEDDON', S / 2, 170)

  ctx.fillStyle = '#7dffd6'
  ctx.font = '30px ui-monospace, Menlo, monospace'
  ctx.fillText(`${result.mode === 'daily' ? 'DAILY CHALLENGE' : 'ENDLESS'}  ·  ${result.date}`, S / 2, 226)
  ctx.fillStyle = '#5f8f83'
  ctx.font = '24px ui-monospace, Menlo, monospace'
  ctx.fillText(`${characterById(result.character).name}  ·  ${arenaById(result.arena).name}`, S / 2, 262)

  // Survivor glyph.
  ctx.fillStyle = '#1ce8b5'
  ctx.beginPath()
  ctx.arc(S / 2, 360, 56, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#06231d'
  ctx.beginPath()
  ctx.arc(S / 2 + 18, 360, 24, 0, Math.PI * 2)
  ctx.fill()

  // Score (the hero number).
  ctx.fillStyle = '#57c8ff'
  ctx.font = 'bold 150px ui-monospace, Menlo, monospace'
  ctx.fillText(String(result.score), S / 2, 560)
  ctx.fillStyle = '#3a5a52'
  ctx.font = '28px ui-monospace, Menlo, monospace'
  ctx.fillText('SCORE', S / 2, 600)

  // Stat trio.
  const stats: [string, string][] = [
    ['TIME', fmtTime(result.time)],
    ['KILLS', String(result.kills)],
    ['LEVEL', String(result.level)],
  ]
  const colW = S / 3
  stats.forEach(([label, val], i) => {
    const cx = colW * i + colW / 2
    ctx.fillStyle = '#eafff0'
    ctx.font = 'bold 64px ui-monospace, Menlo, monospace'
    ctx.fillText(val, cx, 760)
    ctx.fillStyle = '#3a5a52'
    ctx.font = '26px ui-monospace, Menlo, monospace'
    ctx.fillText(label, cx, 800)
  })

  // Footer.
  ctx.fillStyle = '#3a5a52'
  ctx.font = '24px ui-monospace, Menlo, monospace'
  ctx.fillText(`seed ${result.seed >>> 0}`, S / 2, S - 70)
  ctx.fillStyle = '#7dffd6'
  ctx.font = '26px ui-monospace, Menlo, monospace'
  ctx.fillText('survive the brood', S / 2, S - 36)

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
