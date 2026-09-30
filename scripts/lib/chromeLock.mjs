// One headless Chrome at a time across every script and worktree on this machine.
// Each WebGL Chrome costs 300 to 500 MB; parallel agents on an 8 GB machine ran it out of
// memory. The lock is a directory (mkdir is atomic) holding the owner's pid, so a crashed
// owner's lock is reclaimed. SWG_NO_CHROME_LOCK=1 skips it.
import { mkdirSync, rmSync, readFileSync, writeFileSync, statSync } from 'node:fs'

const LOCK = '/tmp/swarmgeddon-chrome.lock'

function ownerAlive() {
  let pid = 0
  try {
    pid = parseInt(readFileSync(LOCK + '/pid', 'utf8'))
  } catch {
    // mkdir happened but the pid is not written yet: young locks count as held.
    try {
      return Date.now() - statSync(LOCK).mtimeMs < 10000
    } catch {
      return false
    }
  }
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

export async function acquireChromeLock(label = '') {
  if (process.env.SWG_NO_CHROME_LOCK) return () => {}
  try {
    if (readFileSync(LOCK + '/pid', 'utf8') === String(process.pid)) return () => {}
  } catch {}
  let waited = 0
  for (;;) {
    try {
      mkdirSync(LOCK)
      writeFileSync(LOCK + '/pid', String(process.pid))
      break
    } catch {
      if (!ownerAlive()) {
        rmSync(LOCK, { recursive: true, force: true })
        continue
      }
      if (waited % 30 === 0) console.error(`[chrome-lock] ${label} waiting for another headless Chrome to finish (${waited}s)`)
      await new Promise((r) => setTimeout(r, 1000))
      waited++
    }
  }
  let held = true
  const release = () => {
    if (!held) return
    held = false
    try {
      if (readFileSync(LOCK + '/pid', 'utf8') === String(process.pid)) rmSync(LOCK, { recursive: true, force: true })
    } catch {}
  }
  process.on('exit', release)
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => (release(), process.exit(130)))
  return release
}
