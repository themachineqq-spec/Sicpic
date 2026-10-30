import { cookies } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const created = vi.hoisted(() => ({
  admin: vi.fn(() => ({ kind: 'admin' })),
  browser: vi.fn(() => ({ kind: 'browser' })),
  server: vi.fn((_url: string, _key: string, options: { cookies: { getAll: () => unknown; setAll: (rows: { name: string; value: string }[]) => void } }) => {
    options.cookies.getAll()
    options.cookies.setAll([{ name: 'sb', value: '1' }])
    return { kind: 'server' }
  }),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: created.admin }))
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: created.browser,
  createServerClient: created.server,
}))

describe('supabase clients', () => {
  beforeEach(() => {
    created.admin.mockClear()
    created.browser.mockClear()
    created.server.mockClear()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [{ name: 'sb', value: 'old' }],
      set: () => undefined,
      get: () => undefined,
    } as never)
  })

  it('builds an admin client only when the service key exists', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    expect(createAdminClient()).toEqual({ kind: 'admin' })
    expect(created.admin).toHaveBeenCalledWith('https://example.supabase.co', 'service', {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    expect(() => createAdminClient()).toThrow(/Service-Schlüssel/)
  })

  it('returns a browser client only when the public config is complete', async () => {
    const { createBrowserSupabase } = await import('@/lib/supabase/browser')
    expect(createBrowserSupabase()).toEqual({ kind: 'browser' })
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    expect(createBrowserSupabase()).toBeNull()
  })

  it('reads and writes the request cookies, and ignores a locked cookie store', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    await expect(createClient()).resolves.toEqual({ kind: 'server' })
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: () => {
        throw new Error('cookies are readonly')
      },
      get: () => undefined,
    } as never)
    await expect(createClient()).resolves.toEqual({ kind: 'server' })
    delete process.env.NEXT_PUBLIC_SUPABASE_URL
    await expect(createClient()).rejects.toMatchObject({ code: 'config' })
  })
})
