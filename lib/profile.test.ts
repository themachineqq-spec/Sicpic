import { cookies, headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

const e2e = vi.hoisted(() => vi.fn(async () => false))
const userClient = vi.hoisted(() => ({ from: vi.fn() }))

vi.mock('@/lib/e2e-guard', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/e2e-guard')>()
  return { ...actual, isE2ERequest: e2e }
})
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => userClient }))

const self: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

describe('own display name', () => {
  beforeEach(() => {
    e2e.mockReset()
    e2e.mockResolvedValue(false)
    userClient.from.mockReset()
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
  })

  it('updates only the signed-in row and hides database errors', async () => {
    const { updateOwnDisplayName } = await import('@/lib/profile')
    const eq = vi.fn(() => ({
      select: () => ({
        maybeSingle: async () => ({
          data: { id: self.id, user_id: self.userId, email: self.email, display_name: 'Reise', role: 'member' },
          error: null,
        }),
      }),
    }))
    userClient.from.mockReturnValue({ update: () => ({ eq }) })
    await expect(updateOwnDisplayName(self, 'Reise')).resolves.toMatchObject({ displayName: 'Reise', email: 'ada@example.com' })
    expect(eq).toHaveBeenCalledWith('id', self.id)

    userClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
      }),
    })
    await expect(updateOwnDisplayName(self, 'Reise')).rejects.toMatchObject({ status: 403 })

    userClient.from.mockReturnValue({
      update: () => ({
        eq: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: { code: '23514', message: 'constraint secret' } }),
          }),
        }),
      }),
    })
    await expect(updateOwnDisplayName(self, 'Reise')).rejects.toMatchObject({
      message: 'Der Anzeigename konnte nicht gespeichert werden.',
    })
  })

  it('stores the e2e name without calling Supabase', async () => {
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    e2e.mockResolvedValue(true)
    const { resetE2EStore, readE2EDisplayName } = await import('@/lib/e2e-store')
    resetE2EStore()
    const { updateOwnDisplayName } = await import('@/lib/profile')
    await expect(updateOwnDisplayName(self, 'Reise')).resolves.toMatchObject({ displayName: 'Reise' })
    expect(readE2EDisplayName()).toBe('Reise')
    expect(userClient.from).not.toHaveBeenCalled()
    vi.mocked(headers).mockResolvedValue(new Headers({ host: '127.0.0.1:4174' }))
    vi.mocked(cookies).mockResolvedValue({
      getAll: () => [],
      set: () => undefined,
      get: (name: string) => (name === 'sicpic-e2e' ? { name, value: 'secret' } : { name, value: 'member' }),
    } as never)
    process.env.SICPIC_E2E_TOKEN = 'secret'
    vi.resetModules()
    const named = await import('@/lib/auth')
    await expect(named.getRequestAccess()).resolves.toMatchObject({ member: { displayName: 'Reise', email: 'e2e@example.com' } })
    const { resetE2EStore: resetAgain } = await import('@/lib/e2e-store')
    resetAgain()
    vi.resetModules()
    const plain = await import('@/lib/auth')
    await expect(plain.getRequestAccess()).resolves.toMatchObject({ member: { displayName: 'E2E' } })
  })
})
