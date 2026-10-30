import { mkdirSync } from 'node:fs'
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
await folder.getByRole('img', { name: /strand|sicpic-e2e\.jpg/ }).first().waitFor({ timeout: 20000 })
for (const name of ['sample.mp4', 'sample.mov']) {
  await folder.locator('input[type="file"]').setInputFiles(join(process.cwd(), 'tests/fixtures', name))
  await folder.getByRole('img', { name: `Video ${name}` }).first().waitFor({ timeout: 20000 })
}
await folder.getByRole('button', { name: 'Videos', exact: true }).click()
await folder.getByRole('img', { name: 'Video sample.mp4' }).first().waitFor()
const shots = process.env.SICPIC_SHOTS
if (shots) {
  mkdirSync(shots, { recursive: true })
  await folder.setViewportSize({ width: 390, height: 844 })
  await folder.screenshot({ path: join(shots, 'sicpic-video-mobile.png') })
  await folder.setViewportSize({ width: 1280, height: 800 })
  await folder.screenshot({ path: join(shots, 'sicpic-video-desktop.png') })
}
await folder.getByRole('img', { name: 'Video sample.mp4' }).first().click()
await folder.locator('video').waitFor({ timeout: 10000 })
if (shots) await folder.screenshot({ path: join(shots, 'sicpic-video-player.png') })
const folderViolations = await folder.evaluate(() => window.__violations)
if (folderViolations.length > 0) {
  console.error('csp violations during upload', folderViolations)
  process.exit(1)
}

const admin = await browser.newContext()
await admin.addCookies([
  { name: 'sicpic-e2e', value: token, url: base },
  { name: 'sicpic-e2e-role', value: 'admin', url: base },
])
const membersPage = await admin.newPage()
await membersPage.goto(base + '/verwaltung/mitglieder', { waitUntil: 'load' })
if ((await membersPage.locator('h1').innerText()) !== 'Mitglieder') {
  console.error('members page did not open', await membersPage.locator('h1').innerText())
  process.exit(1)
}
await membersPage.getByRole('button', { name: 'Einladungslink erstellen' }).click()
const inviteLink = await membersPage.getByRole('textbox', { name: 'Einladungslink' }).inputValue()
if (!inviteLink.includes('/einladung/')) {
  console.error('invite link missing', inviteLink)
  process.exit(1)
}
const guest = await browser.newContext()
const invited = await guest.newPage()
await invited.goto(inviteLink, { waitUntil: 'load' })
if ((await invited.locator('h1').innerText()) !== 'Du wurdest zu Sicpic eingeladen') {
  console.error('invite page missing', await invited.locator('h1').innerText())
  process.exit(1)
}
await invited.getByRole('button', { name: 'Mit Google anmelden' }).click()
await invited.waitForURL('**/gruppe', { timeout: 15000 })
if ((await invited.locator('h1').innerText()) !== 'Gruppe') {
  console.error('redeem did not open the group', await invited.locator('h1').innerText())
  process.exit(1)
}
await invited.goto(inviteLink, { waitUntil: 'load' })
if ((await invited.locator('h1').innerText()) !== 'Einladung ungültig') {
  console.error('used invite still open', await invited.locator('h1').innerText())
  process.exit(1)
}

await folder.getByRole('button', { name: 'Schließen' }).click()
await folder.getByRole('link', { name: 'Gruppe' }).click()
await folder.getByRole('heading', { name: 'Gruppe' }).waitFor({ timeout: 15000 })
await folder.getByRole('button', { name: 'Fotos', exact: true }).click()
await folder.waitForURL(/type=photo/, { timeout: 10000 })
if ((await folder.getByRole('button', { name: 'Fotos', exact: true }).getAttribute('aria-pressed')) !== 'true') {
  console.error('photo filter did not stick')
  process.exit(1)
}
await folder.getByRole('link', { name: 'Ordner' }).click()
await folder.getByRole('heading', { name: 'Mein Ordner' }).waitFor({ timeout: 15000 })
await folder.getByRole('link', { name: 'Profil' }).click()
await folder.getByRole('heading', { name: 'Profil' }).waitFor({ timeout: 15000 })
const email = await folder.getByRole('textbox', { name: 'E-Mail' }).inputValue()
if (email !== 'e2e@example.com') {
  console.error('profile email', email)
  process.exit(1)
}
await folder.getByRole('textbox', { name: 'Anzeigename' }).fill('Reise')
await folder.getByRole('button', { name: 'Speichern' }).click()
await folder.getByText('Gespeichert.').waitFor({ timeout: 10000 })
await folder.getByRole('link', { name: 'Gruppe' }).click()
await folder.getByRole('heading', { name: 'Gruppe' }).waitFor({ timeout: 15000 })
await folder.getByRole('combobox', { name: 'Person' }).waitFor({ timeout: 15000 })
const person = await folder.getByRole('combobox', { name: 'Person' }).innerText()
if (!person.includes('Reise')) {
  console.error('renamed person missing', person)
  process.exit(1)
}
const tabViolations = await folder.evaluate(() => window.__violations)
if (tabViolations.length > 0) {
  console.error('csp violations during tab switch', tabViolations)
  process.exit(1)
}

await browser.close()
console.log('e2e ok')
