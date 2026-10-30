import http from 'node:http'
import { join } from 'node:path'
import { chromium } from 'playwright-core'

const base = process.env.SICPIC_URL ?? 'http://127.0.0.1:4173'
const token = process.env.SICPIC_E2E_TOKEN ?? 'e2e-token'
const url = new URL(base)

function request(host, path, method, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path,
        method,
        headers: { host, 'content-type': 'application/octet-stream', 'content-length': Buffer.byteLength(body) },
      },
      (res) => {
        res.resume()
        res.on('end', () => resolve(res.statusCode ?? 0))
      },
    )
    req.on('error', reject)
    req.end(body)
  })
}

const blocked = await request('sicpic.netlify.app', '/api/e2e/upload?photoId=1&slot=original', 'PUT', 'x')
if (blocked !== 404) {
  console.error('e2e upload must stay hidden off loopback, got', blocked)
  process.exit(1)
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`)
  })
})

await page.goto(base + '/', { waitUntil: 'load' })
const headline = await page.locator('h1').innerText()
if (headline !== 'Urlaubs-Fotos an einem Ort') {
  console.error('unexpected headline', headline)
  process.exit(1)
}
if (!(await page.getByRole('button', { name: 'Mit Google anmelden' }).isVisible())) {
  console.error('login button missing')
  process.exit(1)
}
const policy = await page.evaluate(async () => {
  const response = await fetch(location.href)
  return response.headers.get('content-security-policy') ?? ''
})
if (!policy.includes("'strict-dynamic'") || !policy.includes("'nonce-") || policy.includes('unsafe-eval')) {
  console.error('unexpected csp', policy)
  process.exit(1)
}
const violations = await page.evaluate(() => window.__violations)
if (violations.length > 0) {
  console.error('csp violations', violations)
  process.exit(1)
}

const authed = await browser.newContext()
await authed.addCookies([
  { name: 'sicpic-e2e', value: token, url: base },
  { name: 'sicpic-e2e-role', value: 'member', url: base },
])
const folder = await authed.newPage()
await folder.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__violations.push(`${event.violatedDirective} ${event.blockedURI}`)
  })
})
await folder.goto(base + '/ordner', { waitUntil: 'load' })
if ((await folder.locator('h1').innerText()) !== 'Mein Ordner') {
  console.error('folder did not open', await folder.locator('h1').innerText())
  process.exit(1)
}

const file = join(process.cwd(), 'tests/e2e/strand.jpg')
await folder.locator('input[type="file"]').setInputFiles(file)
await folder.getByText('Gespeichert').waitFor({ timeout: 20000 })
await folder.getByRole('img', { name: /strand|sicpic-e2e\.jpg/ }).waitFor({ timeout: 20000 })
const folderViolations = await folder.evaluate(() => window.__violations)
if (folderViolations.length > 0) {
  console.error('csp violations during upload', folderViolations)
  process.exit(1)
}

await browser.close()
console.log('e2e ok')
