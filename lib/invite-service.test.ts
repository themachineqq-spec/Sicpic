import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

const e2e = vi.hoisted(() => vi.fn(async () => false))
const userClient = vi.hoisted(() => ({ from: vi.fn() }))
const adminClient = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }))

vi.mock('@/lib/e2e-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/e2e-guard')>()
  return { ...actual, isE2ERequest: e2e }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => userClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))

const actor: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'admin',
}

const row = {
  id: '66666666-6666-4666-8666-666666666666',
  display_name: 'Cara',
  role: 'member',
  created_at: '2026-10-30T12:00:00.000Z',
  expires_at: '2026-11-06T12:00:00.000Z',
}

describe('invite service', () => {
  beforeEach(() => {
    e2e.mockReset()
    e2e.mockResolvedValue(false)
    userClient.from.mockReset()
    adminClient.from.mockReset()
    adminClient.rpc.mockReset()
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
  })

  it('lists, creates and revokes invites without returning the token hash', async () => {
    const { createInviteLink, listOpenInvites, revokeInvite } = await import('@/lib/invite-service')
    userClient.from.mockReturnValue({
      select: () => ({
        is: () => ({
          is: () => ({
            gt: () => ({
              order: async () => ({ data: [row, { ...row, id: '77777777-7777-4777-8777-777777777777', role: 'nope', display_name: '  ' }], error: null }),
            }),
          }),
        }),
      }),
    })
    const listed = await listOpenInvites()
    expect(listed[0]).toMatchObject({ displayName: 'Cara', role: 'member' })
    expect(listed[1]).toMatchObject({ displayName: null, role: 'member' })
    expect(JSON.stringify(listed)).not.toContain('token')

    userClient.from.mockReturnValue({
      select: () => ({
        is: () => ({
          is: () => ({
            gt: () => ({ order: async () => ({ data: null, error: { code: '42501', message: 'secret policy' } }) }),
          }),
        }),
      }),
    })
    await expect(listOpenInvites()).rejects.toMatchObject({ message: 'Einladungen konnten nicht geladen werden.' })

    userClient.from.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: row, error: null }),
        }),
      }),
    })
    const created = await createInviteLink(actor, 'https://sicpic.example', { displayName: ' Cara ', role: 'admin' })
    expect(created.url).toMatch(/^https:\/\/sicpic.example\/einladung\/[A-Za-z0-9_-]+$/)
    expect(created.role).toBe('member')
    expect((created.url.split('/').pop() ?? '').length).toBeGreaterThanOrEqual(43)

    userClient.from.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { code: '23514', message: 'check secret' } }),
        }),
      }),
    })
    await expect(createInviteLink(actor, 'https://sicpic.example', {})).rejects.toMatchObject({
      message: 'Der Einladungslink konnte nicht erstellt werden.',
    })

    userClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          is: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: { id: row.id }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    await expect(revokeInvite(row.id)).resolves.toBeUndefined()
    userClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          is: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    await expect(revokeInvite(row.id)).rejects.toMatchObject({ status: 404 })
    userClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          is: () => ({
            is: () => ({
              select: () => ({
                maybeSingle: async () => ({ data: null, error: { code: '42501', message: 'secret' } }),
              }),
            }),
          }),
        }),
      }),
    })
    await expect(revokeInvite(row.id)).rejects.toMatchObject({ message: 'Die Einladung konnte nicht zurückgezogen werden.' })

    userClient.from.mockReturnValue({
      select: () => ({
        order: async () => ({
          data: [{ id: actor.id, user_id: actor.userId, email: actor.email, display_name: 'Ada', role: 'admin' }],
          error: null,
        }),
      }),
    })
    const { allowInviteAttempt, listMembersForPage } = await import('@/lib/invite-service')
    await expect(listMembersForPage()).resolves.toMatchObject([{ email: 'ada@example.com' }])
    expect(allowInviteAttempt(new Headers({ 'x-forwarded-for': '198.51.100.4' }))).toBe(true)
  })

  it('checks and redeems a hashed token and hides database details', async () => {
    const { hashInviteToken } = await import('@/lib/invite-token')
    const { inviteIsOpen, redeemInviteToken } = await import('@/lib/invite-service')
    const token = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDE'
    const hash = hashInviteToken(token)
    adminClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { token_hash: hash, expires_at: '2099-01-01T00:00:00.000Z', revoked_at: null, used_at: null },
            error: null,
          }),
        }),
      }),
    })
    await expect(inviteIsOpen(token, Date.parse('2026-10-30T00:00:00Z'))).resolves.toBe(true)
    adminClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
        }),
      }),
    })
    await expect(inviteIsOpen('missing-token')).resolves.toBe(false)
    adminClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: { code: '08006', message: 'db secret' } }),
        }),
      }),
    })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await expect(inviteIsOpen(token)).rejects.toMatchObject({ message: 'Die Einladung konnte nicht geprüft werden.' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token)
    expect(JSON.stringify(spy.mock.calls)).toContain('08006')

    const user = { id: actor.userId, email: 'Cara@Example.com', user_metadata: { full_name: 'Cara Google' } }
    adminClient.rpc.mockResolvedValue({
      data: { id: row.id, user_id: user.id, email: 'cara@example.com', display_name: 'Cara', role: 'member' },
      error: null,
    })
    await expect(redeemInviteToken(token, { ...user, email: '' } as never)).resolves.toBeNull()
    await expect(redeemInviteToken(token, user as never)).resolves.toMatchObject({ email: 'cara@example.com', role: 'member' })
    adminClient.rpc.mockResolvedValue({ data: [null], error: null })
    await expect(redeemInviteToken(token, { ...user, user_metadata: { name: 4 } } as never)).resolves.toBeNull()
    adminClient.rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'invite secret' } })
    await expect(redeemInviteToken(token, user as never)).rejects.toMatchObject({ message: 'Die Einladung konnte nicht eingelöst werden.' })
    expect(JSON.stringify(spy.mock.calls)).not.toContain(token)
    spy.mockRestore()
  })

  it('keeps e2e invites in the local store', async () => {
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    e2e.mockResolvedValue(true)
    const { resetE2EStore } = await import('@/lib/e2e-store')
    resetE2EStore()
    const { createInviteLink, inviteIsOpen, listMembersForPage, listOpenInvites, redeemInviteToken, revokeInvite } = await import(
      '@/lib/invite-service'
    )
    const created = await createInviteLink(actor, 'http://127.0.0.1:4173', { displayName: 'Gast', role: 'member' })
    const token = created.url.split('/').pop() ?? ''
    expect(await inviteIsOpen(token)).toBe(true)
    expect((await listOpenInvites()).map((invite) => invite.id)).toEqual([created.id])
    const user = { id: '55555555-5555-4555-8555-555555555555', email: 'gast@example.com', user_metadata: { name: 'Gast' } }
    await expect(redeemInviteToken(token, user as never)).resolves.toMatchObject({ email: 'gast@example.com', displayName: 'Gast' })
    expect(await inviteIsOpen(token)).toBe(false)
    await expect(redeemInviteToken(token, { ...user, email: 'other@example.com' } as never)).resolves.toBeNull()
    const again = await createInviteLink(actor, 'http://127.0.0.1:4173', {})
    await revokeInvite(again.id)
    await expect(revokeInvite(again.id)).rejects.toMatchObject({ status: 404 })
    expect((await listMembersForPage()).some((member) => member.email === 'gast@example.com')).toBe(true)
    resetE2EStore()
  })
})
