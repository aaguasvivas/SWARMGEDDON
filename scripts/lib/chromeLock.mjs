// One headless Chrome at a time across every script and worktree on this machine.
// Each WebGL Chrome costs 300 to 500 MB; parallel agents on an 8 GB machine ran it out of
// memory. The lock is a directory (mkdir is atomic) holding the owner's pid, so a crashed
// owner's lock is reclaimed. SWG_NO_CHROME_LOCK=1 skips it.
import { mkdirSync, rmSync, readFileSync, writeFileSync, statSync, readdirSync, readlinkSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'

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

// A killed run (a Bash timeout, a crash) leaves its puppeteer profile in the temp dir, and
// on a nearly full disk 80 of them took 340 MB. Remove the ones whose Chrome has exited.
function pruneDeadProfiles() {
  const tmp = os.tmpdir()
  let names = []
  try {
    names = readdirSync(tmp).filter((n) => n.startsWith('puppeteer_dev_chrome_profile-'))
  } catch {
    return
  }
  for (const n of names) {
    const dir = join(tmp, n)
    try {
      if (Date.now() - statSync(dir).mtimeMs < 30 * 60 * 1000) continue
      const pid = parseInt(readlinkSync(join(dir, 'SingletonLock')).split('-').pop())
      if (pid) {
        try {
          process.kill(pid, 0)
          continue
        } catch {}
      }
    } catch {}
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {}
  }
}

export async function acquireChromeLock(label = '') {
  if (process.env.SWG_NO_CHROME_LOCK) return () => {}
  pruneDeadProfiles()
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
