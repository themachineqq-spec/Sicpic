import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

const admin = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
}))
const userClient = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => admin }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => userClient }))

const user = { id: '22222222-2222-4222-8222-222222222222', email: 'Ada@Example.com', user_metadata: { full_name: 'Ada Lovelace' } } as unknown as User

describe('linkOrBootstrapMember', () => {
  beforeEach(() => {
    admin.from.mockReset()
    admin.rpc.mockReset()
    process.env.INITIAL_ADMIN_EMAIL = 'ada@example.com'
  })

  it('refuses a different account and anyone who is not the initial admin', async () => {
    const { linkOrBootstrapMember } = await import('@/lib/auth')
    await expect(linkOrBootstrapMember({ ...user, email: '' } as User)).resolves.toBeNull()
    admin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { id: '1', user_id: 'other', email: 'ada@example.com', display_name: 'Ada', role: 'admin' },
            error: null,
          }),
        }),
      }),
    })
    await expect(linkOrBootstrapMember(user)).resolves.toBeNull()
    admin.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    await expect(linkOrBootstrapMember({ ...user, email: 'other@example.com' })).resolves.toBeNull()
    expect(admin.rpc).not.toHaveBeenCalled()
  })

  it('claims the initial admin only once', async () => {
    const { linkOrBootstrapMember } = await import('@/lib/auth')
    admin.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    admin.rpc.mockResolvedValueOnce({
      data: { id: '11111111-1111-4111-8111-111111111111', user_id: user.id, email: 'ada@example.com', display_name: 'Ada Lovelace', role: 'admin' },
      error: null,
    })
    await expect(linkOrBootstrapMember(user)).resolves.toMatchObject({ role: 'admin', email: 'ada@example.com' })
    admin.rpc.mockResolvedValueOnce({ data: null, error: null })
    await expect(linkOrBootstrapMember(user)).resolves.toBeNull()
  })
})

describe('getRequestAccess', () => {
  beforeEach(() => {
    vi.resetModules()
    userClient.auth.getUser.mockReset()
    userClient.from.mockReset()
  })

  it('returns nobody when supabase has no user', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user: null } })
    const { getRequestAccess, requirePageMember, createRequestAccess } = await import('@/lib/auth')
    await expect(getRequestAccess()).resolves.toEqual({ session: null, member: null })
    await expect(requirePageMember()).rejects.toThrow(/REDIRECT:\//)
    const access = createRequestAccess()
    await expect(access.getSession()).resolves.toBeNull()
  })

  it('loads the member row and sends a signed-in guest to the invite page', async () => {
    userClient.auth.getUser.mockResolvedValue({ data: { user } })
    userClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: user.id,
              email: 'ada@example.com',
              display_name: 'Ada',
              role: 'admin',
            },
            error: null,
          }),
        }),
      }),
    })
    const { getRequestAccess } = await import('@/lib/auth')
    await expect(getRequestAccess()).resolves.toMatchObject({ member: { role: 'admin', displayName: 'Ada' } })

    vi.resetModules()
    userClient.from.mockReturnValue({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'secret' } }) }),
      }),
    })
    const failed = await import('@/lib/auth')
    await expect(failed.getRequestAccess()).rejects.toMatchObject({ message: 'Mitgliedschaft konnte nicht geladen werden.' })

    vi.resetModules()
    userClient.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    const guest = await import('@/lib/auth')
    await expect(guest.requirePageMember()).rejects.toThrow(/REDIRECT:\/nicht-eingeladen/)
  })
})

describe('linking an existing allowlist row', () => {
  beforeEach(() => {
    vi.resetModules()
    admin.from.mockReset()
    admin.rpc.mockReset()
    process.env.INITIAL_ADMIN_EMAIL = 'ada@example.com'
  })

  it('fills a missing user id and hides lookup failures', async () => {
    const { linkOrBootstrapMember } = await import('@/lib/auth')
    const update = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    admin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: null,
              email: 'ada@example.com',
              display_name: '',
              role: 'member',
            },
            error: null,
          }),
        }),
      }),
      update,
    })
    const linked = await linkOrBootstrapMember({ ...user, user_metadata: { name: 12 } } as User)
    expect(linked).toMatchObject({ userId: user.id, displayName: 'ada' })
    expect(update).toHaveBeenCalled()

    admin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: user.id,
              email: 'ada@example.com',
              display_name: 'Ada',
              role: 'admin',
            },
            error: null,
          }),
        }),
      }),
    })
    await expect(linkOrBootstrapMember(user)).resolves.toMatchObject({ displayName: 'Ada' })

    admin.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: 'secret' } }) }) }),
    })
    await expect(linkOrBootstrapMember(user)).rejects.toMatchObject({ status: 500 })

    admin.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    })
    admin.rpc.mockResolvedValueOnce({ data: null, error: { message: 'secret rpc' } })
    await expect(linkOrBootstrapMember(user)).rejects.toMatchObject({ message: 'Das Admin-Konto konnte nicht angelegt werden.' })

    admin.rpc.mockResolvedValueOnce({
      data: [{ id: '11111111-1111-4111-8111-111111111111', user_id: user.id, email: 'ada@example.com', display_name: 'Ada Lovelace', role: 'admin' }],
      error: null,
    })
    await expect(linkOrBootstrapMember(user)).resolves.toMatchObject({ role: 'admin' })
  })

  it('reports a failed link update', async () => {
    const { linkOrBootstrapMember } = await import('@/lib/auth')
    admin.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: {
              id: '11111111-1111-4111-8111-111111111111',
              user_id: null,
              email: 'ada@example.com',
              display_name: 'Ada',
              role: 'member',
            },
            error: null,
          }),
        }),
      }),
      update: () => ({ eq: async () => ({ error: { message: 'secret' } }) }),
    })
    await expect(linkOrBootstrapMember(user)).rejects.toMatchObject({ message: 'Mitgliedschaft konnte nicht verknüpft werden.' })
  })
})
