import { describe, expect, it } from 'vitest'
import { buildContentSecurityPolicy, supabaseConnectSources } from '@/lib/csp'

const nonce = 'abc123'

describe('buildContentSecurityPolicy', () => {
  it('allows only nonced scripts plus strict-dynamic in production', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: false })
    const scriptSrc = policy.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src'))
    expect(scriptSrc).toBe(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`)
    expect(scriptSrc).not.toContain('unsafe-inline')
    expect(scriptSrc).not.toContain('unsafe-eval')
    expect(policy).toContain("style-src 'self' 'unsafe-inline'")
    expect(policy).toContain("default-src 'self'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("object-src 'none'")
    expect(policy).toContain("base-uri 'self'")
    expect(policy).toContain("worker-src 'self' blob:")
    expect(policy).toContain('https://*.r2.cloudflarestorage.com')
    expect(policy).toContain('https://uvmycgkhpbpeegdrasqv.supabase.co')
    expect(policy).toContain('wss://uvmycgkhpbpeegdrasqv.supabase.co')
    expect(policy).toContain('https://accounts.google.com')
    expect(policy).toContain('upgrade-insecure-requests')
  })

  it('adds unsafe-eval only in development', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: true })
    expect(policy).toContain("'unsafe-eval'")
    expect(policy).not.toContain('upgrade-insecure-requests')
  })

  it('can omit script-src self so a same-origin script without a nonce cannot fall back to it', () => {
    const policy = buildContentSecurityPolicy({ nonce, isDev: false, includeScriptSelf: false })
    expect(policy).toContain(`script-src 'nonce-${nonce}' 'strict-dynamic'`)
    expect(policy).not.toContain("script-src 'self'")
  })

  it('adds a second supabase origin and ignores a broken url', () => {
    const sources = supabaseConnectSources('https://other.supabase.co/rest/v1')
    expect(sources.https).toContain('https://other.supabase.co')
    expect(sources.wss).toContain('wss://other.supabase.co')
    expect(supabaseConnectSources('not a url').https).toBe('https://uvmycgkhpbpeegdrasqv.supabase.co')
    expect(supabaseConnectSources(null).https).toBe('https://uvmycgkhpbpeegdrasqv.supabase.co')
    const policy = buildContentSecurityPolicy({ nonce, supabaseUrl: 'https://other.supabase.co' })
    expect(policy).toContain('https://other.supabase.co')
  })
})
