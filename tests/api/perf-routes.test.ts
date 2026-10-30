import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member, PhotoRecord } from '@/lib/types'

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  photo: null as PhotoRecord | null,
  months: vi.fn(async () => [{ monthKey: '2024-07', photoCount: 3 }]),
  attach: vi.fn(async () => undefined),
}))

vi.mock('@/lib/auth', () => ({
  createRequestAccess: () => ({
    getSession: async () => state.session,
    getMember: async () => state.member,
  }),
}))
vi.mock('@/lib/photo-service', () => ({
  listPhotoMonths: state.months,
  getPhotoRecord: async () => state.photo,
  attachThumbSet: state.attach,
}))
vi.mock('@/lib/r2', () => ({
  createR2Signer: () => ({
    signPut: async ({ key }: { key: string }) => `https://signed.example/${key}`,
  }),
}))

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

const photo: PhotoRecord = {
  id: '44444444-4444-4444-8444-444444444444',
  ownerId: member.id,
  originalKey: `members/${member.id}/photos/44444444-4444-4444-8444-444444444444/original.jpg`,
  displayKey: `members/${member.id}/photos/44444444-4444-4444-8444-444444444444/display.jpg`,
  thumbKey: `members/${member.id}/photos/44444444-4444-4444-8444-444444444444/thumb.jpg`,
  thumbLargeKey: null,
  blurData: null,
  filename: 'a.jpg',
  contentType: 'image/jpeg',
  byteSize: 10,
  width: 10,
  height: 10,
  capturedAt: '2024-07-01T00:00:00.000Z',
  createdAt: '2024-07-01T00:00:00.000Z',
  uploaderName: 'Ada',
  mediaType: 'photo',
  durationMs: null,
  codec: null,
}

describe('timeline and thumbnail backfill routes', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.photo = null
    state.attach.mockClear()
  })

  it('requires a member before listing months or signing replacement thumbs', async () => {
    const months = await import('@/app/api/photos/months/route')
    const upgrade = await import('@/app/api/photos/[id]/thumb-upgrade/route')
    const context = { params: Promise.resolve({ id: photo.id }) }
    expect((await months.GET(new Request('http://127.0.0.1/api/photos/months'))).status).toBe(401)
    expect((await upgrade.POST(new Request('http://127.0.0.1', { method: 'POST', body: '{}' }), context)).status).toBe(401)
    state.session = { userId: member.userId! }
    state.member = member
    state.photo = photo
    const listed = await months.GET(new Request('http://127.0.0.1/api/photos/months?scope=mine&media=photo'))
    expect(listed.status).toBe(200)
    expect((await months.GET(new Request('http://127.0.0.1/api/photos/months?media=nope'))).status).toBe(200)
    state.member = null
    expect((await months.GET(new Request('http://127.0.0.1/api/photos/months'))).status).toBe(403)
    state.member = member
    const started = await upgrade.POST(new Request('http://127.0.0.1', { method: 'POST', body: '{}' }), context)
    expect(started.status).toBe(200)
    const finished = await upgrade.POST(
      new Request('http://127.0.0.1', {
        method: 'POST',
        body: JSON.stringify({ blurData: `data:image/jpeg;base64,${'a'.repeat(40)}`, contentType: 'image/jpeg' }),
      }),
      context,
    )
    expect(finished.status).toBe(200)
    expect(state.attach).toHaveBeenCalled()
    state.photo = { ...photo, ownerId: '33333333-3333-4333-8333-333333333333' }
    expect((await upgrade.POST(new Request('http://127.0.0.1', { method: 'POST', body: '{}' }), context)).status).toBe(403)
  })
})
