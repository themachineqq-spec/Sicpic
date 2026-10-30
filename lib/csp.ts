const SUPABASE_ORIGIN = 'https://uvmycgkhpbpeegdrasqv.supabase.co'

export type CspOptions = {
  nonce: string
  isDev?: boolean
  supabaseUrl?: string | null
  /**
   * CSP3 browsers ignore host allowlists such as 'self' when a nonce and
   * 'strict-dynamic' are present, so a same-origin script without the nonce
   * (Netlify's badge) is blocked. CSP2 browsers ignore 'strict-dynamic' and
   * would allow that script via 'self'. Set false to omit 'self'.
   */
  includeScriptSelf?: boolean
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

export function supabaseConnectSources(supabaseUrl?: string | null): { https: string; wss: string } {
  const configured = originOf(supabaseUrl)
  const https = configured && configured !== SUPABASE_ORIGIN ? `${SUPABASE_ORIGIN} ${configured}` : SUPABASE_ORIGIN
  const wss = https
    .split(' ')
    .map((origin) => origin.replace(/^https:/, 'wss:'))
    .join(' ')
  return { https, wss }
}

export function buildContentSecurityPolicy(options: CspOptions): string {
  const isDev = options.isDev ?? false
  const includeScriptSelf = options.includeScriptSelf ?? true
  const supabase = supabaseConnectSources(options.supabaseUrl)
  const scriptSrc = [
    'script-src',
    includeScriptSelf ? "'self'" : null,
    `'nonce-${options.nonce}'`,
    "'strict-dynamic'",
    isDev ? "'unsafe-eval'" : null,
  ]
    .filter(Boolean)
    .join(' ')

  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https://*.r2.cloudflarestorage.com",
    "media-src 'self' blob: https://*.r2.cloudflarestorage.com",
    "font-src 'self'",
    `connect-src 'self' ${supabase.https} ${supabase.wss} https://*.r2.cloudflarestorage.com`,
    // blob: lets heic2any start its decoder with Worker(URL.createObjectURL(...)).
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    `form-action 'self' ${supabase.https} https://accounts.google.com`,
    "frame-ancestors 'none'",
    isDev ? null : 'upgrade-insecure-requests',
  ]

  return directives.filter(Boolean).join('; ')
}
