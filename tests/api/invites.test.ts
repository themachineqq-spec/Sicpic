import { beforeEach, describe, expect, it, vi } from 'vitest'
import { headers } from 'next/headers'
import type { Member } from '@/lib/types'

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  list: vi.fn(),
  create: vi.fn(),
  revoke: vi.fn(),
  open: vi.fn(),
  redeem: vi.fn(),
  link: vi.fn(),
  exchange: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  createRequestAccess: () => ({
    getSession: async () => state.session,
    getMember: async () => state.member,
  }),
  linkOrBootstrapMember: state.link,
}))
vi.mock('@/lib/invite-service', () => ({
  listOpenInvites: state.list,
  createInviteLink: state.create,
  revokeInvite: state.revoke,
  inviteIsOpen: state.open,
  redeemInviteToken: state.redeem,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: state.exchange,
      getUser: state.getUser,
      signOut: state.signOut,
    },
  }),
}))

const admin: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'admin',
}
const member: Member = { ...admin, role: 'member' }
const inviteId = '66666666-6666-4666-8666-666666666666'

describe('invite routes', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.list.mockReset()
    state.create.mockReset()
    state.revoke.mockReset()
    state.open.mockReset()
    state.redeem.mockReset()
    state.link.mockReset()
    state.exchange.mockReset()
    state.getUser.mockReset()
    state.signOut.mockReset()
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
    delete process.env.SICPIC_E2E_TOKEN
    vi.mocked(headers).mockResolvedValue(new Headers())
  })

  it('lets only an admin create, list and revoke invites', async () => {
    const route = await import('@/app/api/invites/route')
    const item = await import('@/app/api/invites/[id]/route')
    expect((await route.GET()).status).toBe(401)
    state.session = { userId: member.userId! }
    state.member = member
    expect((await route.POST(new Request('http://127.0.0.1/api/invites', { method: 'POST', body: '{}' }))).status).toBe(403)
    expect((await item.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: inviteId }) })).status).toBe(403)

    state.member = admin
    state.list.mockResolvedValue([])
    expect((await route.GET()).status).toBe(200)
    state.create.mockResolvedValue({ id: inviteId, url: 'https://sicpic.example/einladung/tok', role: 'member', displayName: null, createdAt: '', expiresAt: '' })
    const created = await route.POST(
      new Request('http://127.0.0.1/api/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName: 'Cara', role: 'member' }),
      }),
    )
    expect(created.status).toBe(201)
    expect(state.create).toHaveBeenCalledWith(admin, 'http://127.0.0.1', { displayName: 'Cara', role: 'member' })
    state.revoke.mockResolvedValue(undefined)
    expect((await item.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: inviteId }) })).status).toBe(200)
    expect((await item.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(400)
    state.revoke.mockRejectedValue(new Error('db secret'))
    const leaked = await item.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: inviteId }) })
    expect(leaked.status).toBe(500)
    expect(JSON.stringify(await leaked.json())).not.toContain('secret')
  })

  it('sets an httpOnly cookie only for an open invite and redeems it after Google', async () => {
    const { resetInviteRateLimit } = await import('@/lib/invite-token')
    resetInviteRateLimit()
    const prepare = await import('@/app/api/invites/prepare/route')
    const callback = await import('@/app/auth/callback/route')
    state.open.mockResolvedValue(false)
    const closed = await prepare.POST(
      new Request('http://127.0.0.1/api/invites/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
        body: JSON.stringify({ token: 'secret-token' }),
      }),
    )
    expect(closed.status).toBe(400)
    expect(closed.headers.get('set-cookie')).toBeNull()
    expect(JSON.stringify(await closed.json())).not.toContain('secret-token')

    state.open.mockResolvedValue(true)
    const opened = await prepare.POST(
      new Request('http://127.0.0.1/api/invites/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.8' },
        body: JSON.stringify({ token: 'secret-token' }),
      }),
    )
    expect(opened.status).toBe(200)
    const cookie = opened.headers.get('set-cookie') ?? ''
    expect(cookie).toContain('sicpic-invite=secret-token')
    expect(cookie.toLowerCase()).toContain('httponly')
    expect(cookie.toLowerCase()).toContain('samesite=lax')
    expect(cookie.toLowerCase()).not.toContain('secure')

    state.exchange.mockResolvedValue({ error: null })
    state.getUser.mockResolvedValue({ data: { user: { id: admin.userId, email: 'cara@example.com', user_metadata: { full_name: 'Cara' } } } })
    state.link.mockResolvedValue(null)
    state.redeem.mockResolvedValue({ ...member, email: 'cara@example.com' })
    state.signOut.mockResolvedValue({ error: null })
    const joined = await callback.GET(
      new Request('http://127.0.0.1/auth/callback?code=abc&next=/gruppe', {
        headers: { cookie: 'sicpic-invite=secret-token' },
      }),
    )
    expect(new URL(joined.headers.get('location') ?? '').pathname).toBe('/gruppe')
    expect(state.redeem).toHaveBeenCalled()
    expect(joined.headers.get('set-cookie') ?? '').toContain('sicpic-invite=')

    state.redeem.mockResolvedValue(null)
    const used = await callback.GET(
      new Request('http://127.0.0.1/auth/callback?code=abc', { headers: { cookie: 'sicpic-invite=secret-token' } }),
    )
    expect(new URL(used.headers.get('location') ?? '').pathname).toBe('/einladung/ungueltig')
    expect(state.signOut).toHaveBeenCalled()

    const blocked = await callback.GET(new Request('http://127.0.0.1/auth/callback?e2e=1'))
    expect(blocked.headers.get('location')).toContain('fehler=anmeldung')

    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    process.env.SICPIC_E2E_TOKEN = 'e2e-token'
    vi.mocked(headers).mockResolvedValue(new Headers({ host: '127.0.0.1:4173' }))
    state.redeem.mockResolvedValue({ ...member, role: 'member' })
    const e2e = await callback.GET(
      new Request('http://127.0.0.1:4173/auth/callback?e2e=1&next=/gruppe', {
        headers: { cookie: 'sicpic-invite=secret-token' },
      }),
    )
    expect(new URL(e2e.headers.get('location') ?? '').pathname).toBe('/gruppe')
    const setCookies = e2e.headers.get('set-cookie') ?? ''
    expect(setCookies).toContain('sicpic-e2e=e2e-token')
    expect(setCookies).toContain('sicpic-e2e-role=member')

    state.redeem.mockResolvedValue(null)
    const e2eMissing = await callback.GET(new Request('http://127.0.0.1:4173/auth/callback?e2e=1'))
    expect(new URL(e2eMissing.headers.get('location') ?? '').pathname).toBe('/einladung/ungueltig')

    state.redeem.mockRejectedValue(new Error('store secret'))
    const e2eBroken = await callback.GET(
      new Request('http://127.0.0.1:4173/auth/callback?e2e=1', { headers: { cookie: 'sicpic-invite=secret-token' } }),
    )
    expect(new URL(e2eBroken.headers.get('location') ?? '').pathname).toBe('/einladung/ungueltig')
    expect(e2eBroken.headers.get('location')).not.toContain('secret')

    state.redeem.mockResolvedValue({ ...member, role: 'admin' })
    const e2eAdmin = await callback.GET(
      new Request('https://127.0.0.1/auth/callback?e2e=1&next=/foo\\bar', {
        headers: { cookie: 'sicpic-invite=secret-token' },
      }),
    )
    expect(new URL(e2eAdmin.headers.get('location') ?? '').pathname).toBe('/gruppe')
    expect(e2eAdmin.headers.get('set-cookie') ?? '').toContain('sicpic-e2e-role=admin')

    state.link.mockResolvedValue(member)
    state.exchange.mockResolvedValue({ error: null })
    state.getUser.mockResolvedValue({ data: { user: { id: member.userId, email: member.email } } })
    const already = await callback.GET(
      new Request('http://127.0.0.1/auth/callback?code=abc&next=/ordner', {
        headers: { cookie: 'sicpic-invite=secret-token' },
      }),
    )
    expect(new URL(already.headers.get('location') ?? '').pathname).toBe('/ordner')
    state.link.mockRejectedValue('not-an-error')
    const nameless = await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc'))
    expect(nameless.headers.get('location')).toContain('fehler=config')

    state.open.mockImplementation(async (token: string) => token === 'secret-token')
    const secure = await prepare.POST(
      new Request('https://sicpic.example/api/invites/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ token: 'secret-token' }),
      }),
    )
    expect(secure.headers.get('set-cookie')?.toLowerCase()).toContain('secure')
    const empty = await prepare.POST(
      new Request('http://127.0.0.1/api/invites/prepare', {
        method: 'POST',
        headers: { 'x-forwarded-for': '203.0.113.9' },
        body: '{',
      }),
    )
    expect(empty.status).toBe(400)
    for (let i = 0; i < 40; i += 1) {
      await prepare.POST(
        new Request('http://127.0.0.1/api/invites/prepare', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
          body: JSON.stringify({ token: 'secret-token' }),
        }),
      )
    }
    const limited = await prepare.POST(
      new Request('http://127.0.0.1/api/invites/prepare', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify({ token: 'secret-token' }),
      }),
    )
    expect(limited.status).toBe(429)
  })
})
