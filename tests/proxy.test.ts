import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
}))

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn((_url: string, _key: string, options: {
    cookies: {
      getAll: () => { name: string; value: string }[]
      setAll: (rows: { name: string; value: string; options?: object }[], headers: Record<string, string>) => void
    }
  }) => {
    options.cookies.setAll([{ name: 'sb-access-token', value: 'token', options: { path: '/' } }], { 'cache-control': 'private' })
    return { auth: { getUser: async () => ({ data: { user: auth.user } }) } }
  }),
}))

describe('proxy CSP nonce', () => {
  beforeEach(() => {
    auth.user = null
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
  })

  it('puts a fresh nonce on every document and keeps it when cookies are refreshed', async () => {
    const { proxy } = await import('@/proxy')
    const first = await proxy(new NextRequest('http://127.0.0.1:4173/'))
    const second = await proxy(new NextRequest('http://127.0.0.1:4173/'))
    const firstPolicy = first.headers.get('content-security-policy') ?? ''
    const secondPolicy = second.headers.get('content-security-policy') ?? ''
    const firstNonce = firstPolicy.match(/'nonce-([^']+)'/)?.[1]
    const secondNonce = secondPolicy.match(/'nonce-([^']+)'/)?.[1]
    expect(firstNonce).toBeTruthy()
    expect(secondNonce).toBeTruthy()
    expect(firstNonce).not.toBe(secondNonce)
    expect(firstPolicy).toContain("'strict-dynamic'")
    expect(firstPolicy).not.toContain('unsafe-eval')
    expect(first.cookies.get('sb-access-token')?.value).toBe('token')
    expect(first.headers.get('cache-control')).toBe('private')
  })

  it('sends anonymous visitors away from member pages and leaves the login page alone', async () => {
    const { proxy } = await import('@/proxy')
    const privacy = await proxy(new NextRequest('http://127.0.0.1:4173/datenschutz'))
    const terms = await proxy(new NextRequest('http://127.0.0.1:4173/nutzungsbedingungen'))
    expect(privacy.headers.get('location')).toBeNull()
    expect(terms.headers.get('location')).toBeNull()
    expect(privacy.headers.get('content-security-policy')).toContain("'strict-dynamic'")
    expect(terms.headers.get('content-security-policy')).not.toContain('unsafe-eval')
    const blocked = await proxy(new NextRequest('http://127.0.0.1:4173/ordner'))
    expect(blocked.status).toBeGreaterThanOrEqual(300)
    expect(new URL(blocked.headers.get('location') ?? 'http://invalid').pathname).toBe('/')
    expect(blocked.headers.get('content-security-policy')).toContain('nonce-')
    auth.user = { id: 'user' }
    const allowed = await proxy(new NextRequest('http://127.0.0.1:4173/verwaltung/mitglieder'))
    expect(allowed.headers.get('location')).toBeNull()
    auth.user = null
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    process.env.SICPIC_E2E_TOKEN = 'secret'
    const bypassRequest = new NextRequest('http://127.0.0.1:4173/ordner', {
      headers: { host: '127.0.0.1:4173', cookie: 'sicpic-e2e=secret; sicpic-e2e-role=member' },
    })
    bypassRequest.cookies.set('sicpic-e2e', 'secret')
    bypassRequest.cookies.set('sicpic-e2e-role', 'member')
    const bypass = await proxy(bypassRequest)
    expect(bypass.headers.get('location')).toBeNull()
    const missingCookie = await proxy(new NextRequest('http://127.0.0.1:4173/ordner'))
    expect(new URL(missingCookie.headers.get('location') ?? 'http://invalid').pathname).toBe('/')
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
    delete process.env.SICPIC_E2E_TOKEN
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    const open = await proxy(new NextRequest('http://127.0.0.1:4173/gruppe'))
    expect(open.headers.get('content-security-policy')).toContain("default-src 'self'")
    expect(open.headers.get('location')).toBeNull()
  })
})
