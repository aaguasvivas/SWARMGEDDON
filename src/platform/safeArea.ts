/**
 * Safe-area inset reader.
 *
 * On notched phones / devices with rounded corners, content must avoid
 * `env(safe-area-inset-*)`. CSS can't hand those values to JS directly, so we
 * keep a hidden probe element whose padding is set to those env() values and
 * read its computed style. Cheap, and correct across orientation changes.
 *
 * This lives in `platform/` because the same abstraction will back the
 * Capacitor shell in Phase 4 — game code never reads env() directly.
 */

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

let probe: HTMLDivElement | null = null

export function initSafeArea(): void {
  if (probe) return
  probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:0',
    'height:0',
    'visibility:hidden',
    'pointer-events:none',
    'padding-top:env(safe-area-inset-top)',
    'padding-right:env(safe-area-inset-right)',
    'padding-bottom:env(safe-area-inset-bottom)',
    'padding-left:env(safe-area-inset-left)',
  ].join(';')
  document.body.appendChild(probe)
}

export function getInsets(): Insets {
  if (!probe) return { top: 0, right: 0, bottom: 0, left: 0 }
  const s = getComputedStyle(probe)
  return {
    top: parseFloat(s.paddingTop) || 0,
    right: parseFloat(s.paddingRight) || 0,
    bottom: parseFloat(s.paddingBottom) || 0,
    left: parseFloat(s.paddingLeft) || 0,
  }
}
