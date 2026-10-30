import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  update: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  getRequestAccess: async () => ({ session: state.session, member: state.member }),
}))
vi.mock('@/lib/profile', () => ({
  updateOwnDisplayName: state.update,
}))
vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, connection: async () => undefined }
})

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

function patch(body: unknown) {
  return new Request('http://127.0.0.1/api/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('profile route', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.update.mockReset()
  })

  it('requires a session and renames only the signed-in member', async () => {
    const route = await import('@/app/api/me/route')
    expect((await route.PATCH(patch({ displayName: 'Neu' }))).status).toBe(401)
    state.session = { userId: member.userId! }
    expect((await route.PATCH(patch({ displayName: 'Neu' }))).status).toBe(403)
    state.member = member
    expect((await route.PATCH(new Request('http://127.0.0.1/api/me', { method: 'PATCH', body: 'null' }))).status).toBe(400)
    expect((await route.PATCH(patch({ displayName: '   ' }))).status).toBe(400)
    expect((await route.PATCH(patch({ displayName: 'Ada\nBea' }))).status).toBe(400)
    expect(state.update).not.toHaveBeenCalled()
    state.update.mockResolvedValue({ ...member, displayName: 'Reise' })
    const ok = await route.PATCH(patch({ displayName: '  Reise  ', id: '33333333-3333-4333-8333-333333333333', role: 'admin', email: 'other@example.com' }))
    expect(ok.status).toBe(200)
    expect(state.update).toHaveBeenCalledWith(member, 'Reise')
    expect(JSON.stringify(await ok.json())).not.toContain('other@example.com')
    state.update.mockRejectedValue(new Error('db secret'))
    const leaked = await route.PATCH(patch({ displayName: 'Reise' }))
    expect(leaked.status).toBe(500)
    expect(JSON.stringify(await leaked.json())).not.toContain('secret')
  })
})
