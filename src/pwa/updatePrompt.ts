import { registerSW } from 'virtual:pwa-register'

/**
 * Register the service worker and, when a freshly deployed build is waiting,
 * surface a small toast so the player can update on the spot — instead of a tab
 * silently serving the old cached version until it happens to get reloaded.
 *
 * Tapping "Update" calls updateSW(true): the waiting worker skips waiting, takes
 * control, and the page reloads onto the new build. No-op in the Capacitor build
 * (the PWA plugin is disabled there, so this resolves to a stub).
 */
export function setupUpdatePrompt(): void {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      showToast(() => void updateSW(true))
    },
  })
}

function showToast(onUpdate: () => void): void {
  if (document.getElementById('swarm-update-toast')) return

  const el = document.createElement('div')
  el.id = 'swarm-update-toast'
  el.setAttribute('role', 'status')
  Object.assign(el.style, {
    position: 'fixed',
    left: '50%',
    bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
    transform: 'translate(-50%, 12px)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 12px 10px 16px',
    borderRadius: '12px',
    background: 'rgba(8, 12, 20, 0.92)',
    border: '1px solid rgba(28, 232, 181, 0.5)',
    boxShadow: '0 6px 24px rgba(0, 0, 0, 0.5), 0 0 18px rgba(28, 232, 181, 0.25)',
    color: '#c7fff0',
    font: "13px/1.2 ui-monospace, Menlo, Consolas, monospace",
    zIndex: '9999',
    opacity: '0',
    transition: 'opacity 220ms ease, transform 220ms ease',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
  })

  const label = document.createElement('span')
  label.textContent = 'New version available'

  const update = document.createElement('button')
  update.type = 'button'
  update.textContent = 'Update'
  Object.assign(update.style, {
    cursor: 'pointer',
    padding: '7px 14px',
    borderRadius: '8px',
    border: '0',
    background: '#1ce8b5',
    color: '#04231b',
    font: "bold 13px ui-monospace, Menlo, Consolas, monospace",
  })
  update.addEventListener('click', () => {
    update.textContent = 'Updating…'
    update.disabled = true
    onUpdate()
  })

  const dismiss = document.createElement('button')
  dismiss.type = 'button'
  dismiss.setAttribute('aria-label', 'Dismiss')
  dismiss.textContent = '✕'
  Object.assign(dismiss.style, {
    cursor: 'pointer',
    padding: '6px 8px',
    borderRadius: '8px',
    border: '0',
    background: 'transparent',
    color: '#5f8f83',
    font: "13px ui-monospace, Menlo, Consolas, monospace",
  })
  dismiss.addEventListener('click', () => {
    el.style.opacity = '0'
    el.style.transform = 'translate(-50%, 12px)'
    setTimeout(() => el.remove(), 240)
  })

  el.append(label, update, dismiss)
  document.body.appendChild(el)
  // Trigger the enter transition on the next frame.
  requestAnimationFrame(() => {
    el.style.opacity = '1'
    el.style.transform = 'translate(-50%, 0)'
  })
}
