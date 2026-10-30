import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const manifestPath = '.next/server/app/(app)/gruppe/page/build-manifest.json'
const budget = Number(process.env.PERF_JS_BUDGET ?? 700_000)
if (!existsSync(manifestPath)) {
  console.error('missing gruppe build manifest')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const files = [...(manifest.polyfillFiles ?? []), ...(manifest.rootMainFiles ?? [])]
let bytes = 0
for (const file of files) {
  const path = join('.next', file)
  if (existsSync(path)) bytes += statSync(path).size
}
console.log(`gruppe_first_load_js_bytes ${bytes} files ${files.length} budget ${budget}`)
if (!bytes || bytes > budget) {
  console.error(`bundle budget exceeded: ${bytes} > ${budget}`)
  process.exit(1)
}
