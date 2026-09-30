import { MAX_NAME, MIN_NAME } from '../net/leaderboard.ts'
import { FONT } from './tokens.ts'

/**
 * The leaderboard name prompt (section 8.2). DOM, not Pixi, because it needs a
 * real text input for the native keyboard. Resolves with the trimmed name, or
 * null when cancelled.
 */
let activeClose: (() => void) | null = null

/** A tap that opened the prompt must not also close it: the backdrop closes
 *  only for a pointerdown that started on it, this long after open. */
const BACKDROP_ARM_MS = 350

const C = {
  scrim: 'rgba(5, 7, 13, 0.88)',
  panel: '#0c1220',
  line: '#6f8f89',
  textHi: '#eafff6',
  textPrimary: '#7dffd6',
  muted: '#7da99c',
  accent: '#1ce8b5',
  danger: '#ff5a6e',
  ink: '#05070d',
}

/** Dismiss an open prompt (Android back button). True if one was open. */
export function dismissNamePrompt(): boolean {
  if (!activeClose) return false
  activeClose()
  return true
}

export function namePromptOpen(): boolean {
  return activeClose !== null
}

/** Code points left after trimming; the server strips invisible ones too. */
function visibleLength(s: string): number {
  return [...s.trim()].length
}

export function promptName(current: string): Promise<string | null> {
  dismissNamePrompt()
  return new Promise((resolve) => {
    const openedAt = performance.now()
    const backdrop = document.createElement('div')
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      background: C.scrim,
      zIndex: '10000',
    })

    const card = document.createElement('div')
    Object.assign(card.style, {
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      boxSizing: 'border-box',
      width: 'min(340px, calc(100vw - 32px))',
      overflowY: 'auto',
      display: 'flex',
      flexDirection: 'column',
      gap: '12px',
      padding: '20px 16px 16px',
      borderRadius: '12px',
      background: C.panel,
      border: `1px solid ${C.line}`,
      font: `500 14px/20px ${FONT.mono}`,
      color: C.textHi,
    })

    const title = document.createElement('div')
    title.textContent = 'YOUR LEADERBOARD NAME'
    Object.assign(title.style, { font: `800 16px/22px ${FONT.mono}`, letterSpacing: '1px', color: C.textPrimary })

    const help = document.createElement('div')
    help.textContent = `${MIN_NAME} to ${MAX_NAME} characters. Shown on the public board.`
    Object.assign(help.style, { font: `500 13px/18px ${FONT.mono}`, color: C.muted })

    const input = document.createElement('input')
    input.type = 'text'
    input.value = current
    input.maxLength = MAX_NAME
    input.placeholder = 'PILOT'
    input.autocapitalize = 'characters'
    input.autocomplete = 'off'
    input.spellcheck = false
    input.enterKeyHint = 'done'
    Object.assign(input.style, {
      boxSizing: 'border-box',
      width: '100%',
      minHeight: '48px',
      padding: '10px 12px',
      borderRadius: '10px',
      border: `1px solid ${C.line}`,
      background: C.ink,
      color: C.textHi,
      font: `800 18px/24px ${FONT.mono}`,
      letterSpacing: '2px',
      textAlign: 'center',
      outline: 'none',
    })

    const error = document.createElement('div')
    error.textContent = ''
    Object.assign(error.style, { font: `500 13px/18px ${FONT.mono}`, color: C.danger, minHeight: '18px' })

    const row = document.createElement('div')
    Object.assign(row.style, { display: 'flex', gap: '8px' })
    const cancel = mkButton('CANCEL', { background: 'transparent', color: C.textHi, border: `1px solid ${C.line}` })
    const save = mkButton('SAVE', { background: C.accent, color: C.ink, border: `1px solid ${C.accent}` })

    // Keep the card in the top third of what the keyboard leaves visible.
    const vv = window.visualViewport
    const place = (): void => {
      const vh = vv ? vv.height : window.innerHeight
      const top = vv ? vv.offsetTop : 0
      card.style.maxHeight = `${Math.max(120, vh - 32)}px`
      card.style.top = `${top + Math.max(16, Math.min(vh / 3 - card.offsetHeight / 2, vh - card.offsetHeight - 16))}px`
    }

    const close = (value: string | null): void => {
      activeClose = null
      backdrop.remove()
      window.removeEventListener('keydown', onKey, true)
      vv?.removeEventListener('resize', place)
      vv?.removeEventListener('scroll', place)
      window.removeEventListener('resize', place)
      resolve(value)
    }
    activeClose = () => close(null)
    const commit = (): void => {
      const name = input.value.trim()
      const n = visibleLength(name)
      if (n < MIN_NAME || n > MAX_NAME) {
        error.textContent = `Use ${MIN_NAME} to ${MAX_NAME} visible characters.`
        input.focus()
        return
      }
      close(name)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        close(null)
      }
    }

    cancel.addEventListener('click', () => close(null))
    save.addEventListener('click', commit)
    input.addEventListener('input', () => {
      error.textContent = ''
    })
    let downOnBackdrop = false
    // The mouse events a touch browser sends after the tap that opened the
    // prompt land on the backdrop; their default would blur the field.
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop) e.preventDefault()
    })
    backdrop.addEventListener('pointerdown', (e) => {
      downOnBackdrop = e.target === backdrop && performance.now() - openedAt >= BACKDROP_ARM_MS
    })
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop && downOnBackdrop) close(null)
      downOnBackdrop = false
    })
    window.addEventListener('keydown', onKey, true)
    vv?.addEventListener('resize', place)
    vv?.addEventListener('scroll', place)
    window.addEventListener('resize', place)

    row.append(cancel, save)
    card.append(title, help, input, error, row)
    backdrop.append(card)
    document.body.append(backdrop)
    place()
    input.focus()
    input.select()
  })
}

function mkButton(text: string, extra: Record<string, string>): HTMLButtonElement {
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = text
  Object.assign(
    b.style,
    {
      flex: '1',
      boxSizing: 'border-box',
      minHeight: '48px',
      cursor: 'pointer',
      padding: '0 12px',
      borderRadius: '12px',
      font: `800 14px/20px ${FONT.mono}`,
      letterSpacing: '1px',
    },
    extra,
  )
  return b
}
