import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const base = process.env.SICPIC_URL ?? 'http://127.0.0.1:4173'
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const page = await browser.newPage()
await page.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__violations.push({
      directive: event.violatedDirective,
      blocked: event.blockedURI,
      sample: event.sample,
    })
  })
})

await page.goto(base + '/', { waitUntil: 'networkidle' })
const headline = await page.locator('h1').innerText()
const button = await page.getByRole('button', { name: 'Mit Google anmelden' }).isVisible()
const csp = (await page.evaluate(() => {
  const meta = performance.getEntriesByType('navigation')[0]
  return meta ? 'nav' : ''
})) 
const headerCsp = await page.evaluate(async () => {
  const response = await fetch(location.href, { headers: { accept: 'text/html' } })
  return response.headers.get('content-security-policy')
})

const startupViolations = await page.evaluate(() => window.__violations.slice())

const hudContext = await browser.newContext({ serviceWorkers: 'block' })
const hudPage = await hudContext.newPage()
await hudPage.addInitScript(() => {
  window.__violations = []
  document.addEventListener('securitypolicyviolation', (event) => {
    window.__violations.push({
      directive: event.violatedDirective,
      blocked: event.blockedURI,
    })
  })
})
await hudPage.route('**/*', async (route) => {
  const request = route.request()
  if (request.url().includes('/vendor/heic2any.js')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: readFileSync('node_modules/heic2any/dist/heic2any.js'),
    })
    return
  }
  if (request.url().includes('/.netlify/scripts/hud')) {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: 'window.__HUD_LOADED = true',
    })
    return
  }
  if (request.resourceType() !== 'document' || !request.url().includes('hud=1')) {
    await route.continue()
    return
  }
  const response = await route.fetch()
  const original = await response.text()
  const csp = response.headers()['content-security-policy'] ?? ''
  const nonce = csp.match(/'nonce-([^']+)'/)?.[1] ?? ''
  console.error('rewrite', original.includes('</body>'), original.length, Boolean(nonce))
  const body = original.replace(
    '</body>',
    `<script async src="/.netlify/scripts/hud?variant=public"></script><script nonce="${nonce}" src="/vendor/heic2any.js"></script></body>`,
  )
  await route.fulfill({ status: response.status(), headers: response.headers(), body })
})
await hudPage.goto(base + '/?hud=1', { waitUntil: 'load' })
await hudPage.waitForTimeout(800)
const hudLoaded = await hudPage.evaluate(() => Boolean(window.__HUD_LOADED))
const hudDom = await hudPage.evaluate(() => ({
  html: document.documentElement.innerHTML.includes('/.netlify/scripts/hud'),
  srcs: [...document.scripts].map((script) => script.src).filter((src) => src.includes('hud')),
}))
const afterHud = await hudPage.evaluate(() => window.__violations.slice())
const heic = await hudPage.evaluate(async () => {
  const before = window.__violations.length
  if (typeof heic2any !== 'function') return { loaded: false, violations: window.__violations.slice(before) }
  const run = heic2any({ blob: new Blob([1, 2, 3, 4], { type: 'image/heic' }), toType: 'image/jpeg' })
    .then(() => 'converted')
    .catch((error) => String(error?.message || error).slice(0, 240))
  const result = await Promise.race([
    run,
    new Promise((resolve) => setTimeout(() => resolve('timeout-worker-started'), 4000)),
  ])
  return { loaded: true, result, violations: window.__violations.slice(before) }
})
await hudContext.close()

const nonceRan = await page.evaluate(() => {
  const nonce = [...document.scripts].map((script) => script.nonce).find(Boolean)
  if (!nonce) return { ok: false, reason: 'no-nonce' }
  const script = document.createElement('script')
  script.nonce = nonce
  script.textContent = 'window.__NONCE_OK = true'
  document.head.appendChild(script)
  return { ok: Boolean(window.__NONCE_OK), nonce }
})

const probes = await page.evaluate(async () => {
  const notes = []
  const before = window.__violations.length
  try {
    await fetch('https://example.r2.cloudflarestorage.com/sicpic/original.jpg', { method: 'PUT', body: 'x' })
    notes.push('put:resolved')
  } catch (error) {
    notes.push('put:' + error.name)
  }
  await new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve()
    image.onerror = () => resolve()
    image.src = 'https://example.r2.cloudflarestorage.com/sicpic/display.jpg'
    setTimeout(resolve, 1500)
  })
  let worker = 'unknown'
  try {
    const blob = new Blob(['self.postMessage("ok")'], { type: 'text/javascript' })
    const url = URL.createObjectURL(blob)
    worker = await new Promise((resolve) => {
      const thread = new Worker(url)
      thread.onmessage = () => resolve('message')
      thread.onerror = () => resolve('error')
      setTimeout(() => resolve('timeout'), 1000)
    })
  } catch (error) {
    worker = 'throw:' + error.name
  }
  let wasm = 'unknown'
  try {
    new WebAssembly.Module(Uint8Array.of(0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00))
    wasm = 'ok'
  } catch (error) {
    wasm = error.name + ':' + error.message
  }
  const added = window.__violations.slice(before)
  return { notes, worker, wasm, added }
})

const sw = await page.evaluate(async () => {
  if (!('serviceWorker' in navigator)) return { ok: false, reason: 'unsupported' }
  try {
    const registration = await navigator.serviceWorker.register('/sw.js')
    return { ok: true, scope: registration.scope }
  } catch (error) {
    return { ok: false, reason: error.message }
  }
})
await page.waitForTimeout(400)
const finalViolations = await page.evaluate(() => window.__violations.slice())

await page.setViewportSize({ width: 390, height: 844 })
await page.screenshot({ path: '/opt/cursor/artifacts/sicpic-login-mobile.png', fullPage: false })
await page.setViewportSize({ width: 1280, height: 800 })
await page.screenshot({ path: '/opt/cursor/artifacts/sicpic-login-desktop.png', fullPage: false })

console.log(JSON.stringify({
  headline,
  button,
  cspIgnored: csp,
  headerCsp,
  startupViolations,
  hudLoaded,
  hudDom,
  hudViolations: afterHud,
  heic,
  nonceRan,
  probes,
  sw,
  finalViolations,
}, null, 2))

await browser.close()
