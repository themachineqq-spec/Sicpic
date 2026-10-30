import { cookies, headers } from 'next/headers'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { e2eAccessOverride, e2eMemberFromCookies, isE2EAuthEnabled, isE2ERequest, isLoopbackHost } from '@/lib/e2e-guard'

const keys = ['SICPIC_E2E_AUTH', 'SICPIC_E2E_LOCAL', 'SICPIC_E2E_TOKEN', 'NETLIFY', 'CONTEXT'] as const

describe('e2e auth guard', () => {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
  })

  it('stays off in production hosts and without both local flags', () => {
    expect(isE2EAuthEnabled()).toBe(false)
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    process.env.NETLIFY = 'true'
    expect(isE2EAuthEnabled()).toBe(false)
    delete process.env.NETLIFY
    process.env.CONTEXT = 'production'
    expect(isE2EAuthEnabled()).toBe(false)
    delete process.env.CONTEXT
    expect(isE2EAuthEnabled()).toBe(true)
    expect(isLoopbackHost('127.0.0.1:4173')).toBe(true)
    expect(isLoopbackHost('sicpic.netlify.app')).toBe(false)
  })

  it('only builds a member when the cookie matches the token', () => {
    expect(e2eMemberFromCookies(undefined, 'member', 'token').member).toBeNull()
    expect(e2eMemberFromCookies('nope', 'admin', 'token').session).toBeNull()
    expect(e2eMemberFromCookies('token', 'admin', 'token').member?.role).toBe('admin')
    expect(e2eMemberFromCookies('token', 'member', 'token').member?.role).toBe('member')
  })

  it('accepts the bypass only on loopback, even when the flags are set', async () => {
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    process.env.SICPIC_E2E_TOKEN = 'secret'
    vi.mocked(headers).mockResolvedValue(new Headers({ host: 'sicpic.netlify.app' }))
    await expect(isE2ERequest()).resolves.toBe(false)
    await expect(e2eAccessOverride()).resolves.toBeNull()
    vi.mocked(headers).mockResolvedValue(new Headers({ host: '127.0.0.1:4173' }))
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: () => undefined,
      get: (name: string) => (name === 'sicpic-e2e' ? { name, value: 'secret' } : { name, value: 'member' }),
    } as never)
    await expect(isE2ERequest()).resolves.toBe(true)
    await expect(e2eAccessOverride()).resolves.toMatchObject({ member: { email: 'e2e@example.com' } })
  })
})