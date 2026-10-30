import { beforeEach, describe, expect, it, vi } from 'vitest'

const userClient = vi.hoisted(() => ({ from: vi.fn() }))
const adminClient = vi.hoisted(() => ({ from: vi.fn() }))
const removeObjects = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => userClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => adminClient }))
vi.mock('@/lib/r2', () => ({ deleteR2Objects: removeObjects }))

const actor = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'admin' as const,
}

describe('member admin', () => {
  beforeEach(() => {
    userClient.from.mockReset()
    adminClient.from.mockReset()
    removeObjects.mockClear()
  })

  it('hides database errors and blocks removing yourself', async () => {
    const { addMember, listMembers, removeMember, updateMemberRole } = await import('@/lib/member-admin')
    userClient.from.mockReturnValue({
      select: () => ({
        order: async () => ({ data: null, error: { message: 'secret connection string' } }),
      }),
    })
    await expect(listMembers()).rejects.toMatchObject({ message: 'Mitglieder konnten nicht geladen werden.' })
    const inserted = {
      id: actor.id,
      user_id: null,
      email: 'bea@example.com',
      display_name: 'Bea',
      role: 'member',
    }
    userClient.from.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: inserted, error: null }),
        }),
      }),
      update: () => ({
        eq: async () => ({ error: { message: 'last_admin secret' } }),
      }),
    })
    await expect(addMember({ email: ' Bea@Example.com ', displayName: 'Bea' })).resolves.toMatchObject({ email: 'bea@example.com' })
    await expect(updateMemberRole(actor.id, 'member')).rejects.toMatchObject({ code: 'last_admin' })
    await expect(removeMember(actor, actor.id)).rejects.toMatchObject({ status: 409 })
    adminClient.from.mockImplementation((table: string) => {
      if (table === 'photos') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      if (table === 'feedback') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    })
    await expect(removeMember(actor, '33333333-3333-4333-8333-333333333333')).rejects.toMatchObject({ status: 404 })
    expect(removeObjects).not.toHaveBeenCalled()
  })

  it('removes another member after deleting their objects', async () => {
    const { addMember, listMembers, removeMember, updateMemberRole } = await import('@/lib/member-admin')
    const other = '33333333-3333-4333-8333-333333333333'
    userClient.from.mockReturnValue({
      select: () => ({
        order: async () => ({
          data: [{ id: actor.id, user_id: actor.userId, email: actor.email, display_name: '', role: 'admin' }],
          error: null,
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: null, error: { code: '23505', message: 'duplicate secret' } }) }),
      }),
      update: () => ({ eq: async () => ({ error: { message: 'check failed' } }) }),
    })
    const listed = await listMembers()
    expect(listed[0]?.displayName).toBe('ada')
    await expect(addMember({ email: 'bea@example.com', role: 'admin' })).rejects.toMatchObject({ status: 409 })
    await expect(addMember({ email: 'not-an-email' })).rejects.toMatchObject({ status: 400 })
    await expect(updateMemberRole(other, 'admin')).rejects.toMatchObject({ status: 500 })

    adminClient.from.mockImplementation((table: string) => {
      if (table === 'photos') {
        return {
          select: () => ({
            eq: async () => ({
              data: [{ original_key: 'members/a/original.jpg', display_key: 'members/a/display.jpg', thumb_key: 'members/a/thumb.jpg' }],
              error: null,
            }),
          }),
        }
      }
      if (table === 'feedback') {
        return { select: () => ({ eq: async () => ({ data: [{ screenshot_key: 'feedback/a/shot.jpg' }, { screenshot_key: null }], error: null }) }) }
      }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: other, role: 'member' }, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: null }) }),
      }
    })
    await removeMember(actor, other)
    expect(removeObjects).toHaveBeenCalledWith([
      'members/a/original.jpg',
      'members/a/display.jpg',
      'members/a/thumb.jpg',
      'feedback/a/shot.jpg',
    ])

    adminClient.from.mockImplementation((table: string) => {
      if (table === 'photos') return { select: () => ({ eq: async () => ({ data: null, error: { message: 'secret' } }) }) }
      if (table === 'feedback') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: other, role: 'admin' }, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: { message: 'last_admin' } }) }),
      }
    })
    await expect(removeMember(actor, other)).rejects.toMatchObject({ status: 500 })
    adminClient.from.mockImplementation((table: string) => {
      if (table === 'photos') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      if (table === 'feedback') return { select: () => ({ eq: async () => ({ data: [], error: null }) }) }
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: other, role: 'admin' }, error: null }) }) }),
        delete: () => ({ eq: async () => ({ error: { message: 'last_admin secret' } }) }),
      }
    })
    await expect(removeMember(actor, other)).rejects.toMatchObject({ code: 'last_admin' })
  })
})
