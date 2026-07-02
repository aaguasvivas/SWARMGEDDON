import { MAX_NAME } from '../net/leaderboard.ts'

/**
 * A small on-brand DOM prompt for the player's leaderboard name. DOM (not Pixi)
 * because it needs a real text <input> for the native keyboard / autofill.
 * Resolves with the trimmed name, or null if cancelled.
 */
let activeClose: (() => void) | null = null

/** Dismiss an open prompt (Android back button). True if one was open. */
export function dismissNamePrompt(): boolean {
  if (!activeClose) return false
  activeClose()
  return true
}

export function promptName(current: string): Promise<string | null> {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div')
    Object.assign(backdrop.style, {
      position: 'fixed',
      inset: '0',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'rgba(3, 5, 10, 0.72)',
      zIndex: '10000',
      backdropFilter: 'blur(3px)',
      WebkitBackdropFilter: 'blur(3px)',
    })

    const card = document.createElement('div')
    Object.assign(card.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '14px',
      padding: '22px 22px 18px',
      borderRadius: '14px',
      background: 'rgba(8, 12, 20, 0.97)',
      border: '1px solid rgba(28, 232, 181, 0.45)',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6), 0 0 24px rgba(28,232,181,0.18)',
      width: 'min(340px, 86vw)',
      font: '14px ui-monospace, Menlo, Consolas, monospace',
      color: '#c7fff0',
    })

    const title = document.createElement('div')
    title.textContent = 'YOUR LEADERBOARD NAME'
    Object.assign(title.style, { fontWeight: 'bold', letterSpacing: '1px', color: '#7dffd6' })

    const input = document.createElement('input')
    input.type = 'text'
    input.value = current
    input.maxLength = MAX_NAME
    input.placeholder = 'ANON'
    input.autocapitalize = 'characters'
    input.spellcheck = false
    Object.assign(input.style, {
      padding: '12px 14px',
      borderRadius: '10px',
      border: '1px solid rgba(125, 255, 214, 0.3)',
      background: 'rgba(0,0,0,0.35)',
      color: '#eafff6',
      font: 'bold 18px ui-monospace, Menlo, Consolas, monospace',
      letterSpacing: '2px',
      textAlign: 'center',
      outline: 'none',
    })

    const row = document.createElement('div')
    Object.assign(row.style, { display: 'flex', gap: '10px', justifyContent: 'flex-end' })

    const cancel = mkButton('Cancel', { background: 'transparent', color: '#7da99c', border: '1px solid rgba(125,255,214,0.2)' })
    const save = mkButton('Save', { background: '#1ce8b5', color: '#04231b' })

    const close = (value: string | null): void => {
      activeClose = null
      backdrop.remove()
      window.removeEventListener('keydown', onKey)
      resolve(value)
    }
    activeClose = () => close(null)
    const commit = (): void => close(input.value.trim() || null)
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Enter') commit()
      else if (e.key === 'Escape') close(null)
    }

    cancel.addEventListener('click', () => close(null))
    save.addEventListener('click', commit)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close(null)
    })
    window.addEventListener('keydown', onKey)

    row.append(cancel, save)
    card.append(title, input, row)
    backdrop.append(card)
    document.body.append(backdrop)
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
      cursor: 'pointer',
      padding: '9px 18px',
      borderRadius: '9px',
      border: '0',
      font: 'bold 13px ui-monospace, Menlo, Consolas, monospace',
    },
    extra,
  )
  return b
}
