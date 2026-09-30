// Font budget gate (npm run check:fonts, chained into build). Section 9.1:
// at most 16 KB per face and 64 KB in total; the build fails above 90 KB.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = fileURLToPath(new URL('../src/assets/fonts', import.meta.url))
const FILE_BUDGET = 16 * 1024
const TOTAL_BUDGET = 64 * 1024
const HARD_LIMIT = 90 * 1024

const files = readdirSync(DIR).filter((f) => /\.(woff2?|ttf|otf)$/.test(f))
if (files.length === 0) {
  console.error(`check:fonts found no font files in ${DIR}`)
  process.exit(1)
}
let total = 0
for (const f of files) {
  const size = statSync(join(DIR, f)).size
  total += size
  if (size > FILE_BUDGET) console.warn(`check:fonts warning: ${f} is ${size} B, over the ${FILE_BUDGET} B per-face budget`)
}
if (total > TOTAL_BUDGET) console.warn(`check:fonts warning: ${total} B total, over the ${TOTAL_BUDGET} B budget`)
if (total > HARD_LIMIT) {
  console.error(`check:fonts failed: fonts total ${total} B, over the ${HARD_LIMIT} B limit`)
  process.exit(1)
}
console.log(`check:fonts ok (${files.length} files, ${total} B)`)
