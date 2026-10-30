import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  people: vi.fn(async () => [{ id: '11111111-1111-4111-8111-111111111111', name: 'Ada' }]),
}))

vi.mock('@/lib/auth', () => ({
  createRequestAccess: () => ({
    getSession: async () => state.session,
    getMember: async () => state.member,
  }),
}))
vi.mock('@/lib/photo-service', () => ({
  listUploaders: state.people,
}))

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

describe('people route', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.people.mockClear()
  })

  it('requires a member and returns the uploader list', async () => {
    const route = await import('@/app/api/photos/people/route')
    expect((await route.GET(new Request('http://127.0.0.1/api/photos/people'))).status).toBe(401)
    state.session = { userId: member.userId! }
    expect((await route.GET(new Request('http://127.0.0.1/api/photos/people'))).status).toBe(403)
    state.member = member
    const ok = await route.GET(new Request('http://127.0.0.1/api/photos/people?scope=mine'))
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toContain('private')
    expect(ok.headers.get('cdn-cache-control')).toBe('no-store')
    expect(state.people).toHaveBeenCalledWith('mine')
  })
})
