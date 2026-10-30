import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  link: vi.fn(),
  listPhotoPage: vi.fn(),
  completePhotoUpload: vi.fn(),
  getPhotoRecord: vi.fn(),
  getPhotoRecords: vi.fn(),
  deletePhotoRecord: vi.fn(),
  signGet: vi.fn(async ({ key, expiresIn }: { key: string; expiresIn: number }) => `https://signed.example/${key}?e=${expiresIn}`),
  signPut: vi.fn(async ({ key, expiresIn }: { key: string; expiresIn: number }) => `https://signed.example/${key}?e=${expiresIn}`),
  deleteR2: vi.fn(async () => undefined),
  createFeedback: vi.fn(),
  listFeedback: vi.fn(),
  updateFeedbackStatus: vi.fn(),
  getFeedbackScreenshotKey: vi.fn(),
  listMembers: vi.fn(),
  addMember: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, connection: async () => undefined }
})
vi.mock('@/lib/auth', () => ({
  createRequestAccess: () => ({
    getSession: async () => state.session,
    getMember: async () => state.member,
  }),
  getRequestAccess: async () => ({ session: state.session, member: state.member }),
  linkOrBootstrapMember: state.link,
}))
vi.mock('@/lib/r2', () => ({
  createLazyR2Signer: () => ({ signGet: state.signGet, signPut: state.signPut }),
  deleteR2Objects: state.deleteR2,
}))
vi.mock('@/lib/photo-service', () => ({
  listPhotoPage: state.listPhotoPage,
  completePhotoUpload: state.completePhotoUpload,
  getPhotoRecord: state.getPhotoRecord,
  getPhotoRecords: state.getPhotoRecords,
  deletePhotoRecord: state.deletePhotoRecord,
}))
vi.mock('@/lib/feedback-service', () => ({
  createFeedback: state.createFeedback,
  listFeedback: state.listFeedback,
  updateFeedbackStatus: state.updateFeedbackStatus,
  getFeedbackScreenshotKey: state.getFeedbackScreenshotKey,
}))
vi.mock('@/lib/member-admin', () => ({
  listMembers: state.listMembers,
  addMember: state.addMember,
  updateMemberRole: state.updateMemberRole,
  removeMember: state.removeMember,
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      exchangeCodeForSession: state.exchangeCodeForSession,
      getUser: state.getUser,
      signOut: state.signOut,
    },
  }),
}))

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}
const admin: Member = { ...member, role: 'admin' }
const photoId = '44444444-4444-4444-8444-444444444444'

function jsonRequest(path: string, body: unknown, method = 'POST') {
  return new Request(`http://127.0.0.1${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function bodyOf(response: Response) {
  return response.json() as Promise<{ error?: string; message?: string }>
}

describe('api routes', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.signGet.mockClear()
    state.deleteR2.mockClear()
    state.listPhotoPage.mockReset()
    state.completePhotoUpload.mockReset()
    state.getPhotoRecord.mockReset()
    state.getPhotoRecords.mockReset()
    state.deletePhotoRecord.mockReset()
    state.createFeedback.mockReset()
    state.listFeedback.mockReset()
    state.updateFeedbackStatus.mockReset()
    state.getFeedbackScreenshotKey.mockReset()
    state.listMembers.mockReset()
    state.addMember.mockReset()
    state.updateMemberRole.mockReset()
    state.removeMember.mockReset()
    state.link.mockReset()
    state.exchangeCodeForSession.mockReset()
    state.getUser.mockReset()
    state.signOut.mockReset()
  })

  it('rejects anonymous and non-members before validation', async () => {
    const photos = await import('@/app/api/photos/route')
    const uploads = await import('@/app/api/photos/uploads/route')
    const thumbs = await import('@/app/api/photos/thumbs/route')
    const photoUrl = await import('@/app/api/photos/[id]/url/route')
    const feedback = await import('@/app/api/feedback/route')
    const feedbackUpload = await import('@/app/api/feedback/uploads/route')
    const members = await import('@/app/api/members/route')
    const me = await import('@/app/api/me/route')

    expect((await photos.GET(new Request('http://127.0.0.1/api/photos?cursor=bad'))).status).toBe(401)
    expect((await uploads.POST(jsonRequest('/api/photos/uploads', {}))).status).toBe(401)
    expect((await thumbs.POST(jsonRequest('/api/photos/thumbs', { ids: ['nope'] }))).status).toBe(401)
    expect((await photoUrl.GET(new Request('http://127.0.0.1/api/photos/x/url?variant=nope'), { params: Promise.resolve({ id: photoId }) })).status).toBe(401)
    expect((await feedback.POST(jsonRequest('/api/feedback', {}))).status).toBe(401)
    expect((await feedbackUpload.POST(jsonRequest('/api/feedback/uploads', {}))).status).toBe(401)
    expect((await members.GET()).status).toBe(401)
    expect((await me.GET()).status).toBe(401)

    state.session = { userId: member.userId! }
    state.member = null
    expect((await photos.GET(new Request('http://127.0.0.1/api/photos'))).status).toBe(403)
    expect((await feedback.GET(new Request('http://127.0.0.1/api/feedback'))).status).toBe(403)
    expect((await members.GET()).status).toBe(403)
    expect((await me.GET()).status).toBe(403)
  })

  it('serves member and admin happy paths and hides signer failures', async () => {
    state.session = { userId: member.userId! }
    state.member = member
    const photos = await import('@/app/api/photos/route')
    const uploads = await import('@/app/api/photos/uploads/route')
    const photoUrl = await import('@/app/api/photos/[id]/url/route')
    const remove = await import('@/app/api/photos/[id]/route')
    const feedback = await import('@/app/api/feedback/route')
    const me = await import('@/app/api/me/route')

    state.listPhotoPage.mockResolvedValue({ photos: [], expiresIn: 300, nextCursor: null })
    expect((await photos.GET(new Request('http://127.0.0.1/api/photos?scope=mine'))).status).toBe(200)
    state.completePhotoUpload.mockRejectedValue(new Error('R2 secret stack'))
    const failed = await photos.POST(jsonRequest('/api/photos', {
      photoId,
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      width: 1,
      height: 1,
      capturedAt: '2024-01-01T00:00:00.000Z',
    }))
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await bodyOf(failed))).not.toContain('secret')

    state.getPhotoRecord.mockResolvedValue({
      id: photoId,
      ownerId: member.id,
      originalKey: `members/${member.id}/photos/${photoId}/original.jpg`,
      displayKey: `members/${member.id}/photos/${photoId}/display.jpg`,
      thumbKey: `members/${member.id}/photos/${photoId}/thumb.jpg`,
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      byteSize: 10,
      width: 1,
      height: 1,
      capturedAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      uploaderName: 'Ada',
    })
    expect((await photoUrl.GET(new Request(`http://127.0.0.1/api/photos/${photoId}/url?variant=thumb`), { params: Promise.resolve({ id: photoId }) })).status).toBe(200)
    state.signGet.mockRejectedValueOnce(new Error('signature secret'))
    const signed = await photoUrl.GET(new Request(`http://127.0.0.1/api/photos/${photoId}/url?variant=display`), { params: Promise.resolve({ id: photoId }) })
    expect(signed.status).toBe(500)
    expect(JSON.stringify(await bodyOf(signed))).not.toContain('signature')
    expect((await remove.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: photoId }) })).status).toBe(200)
    expect((await uploads.POST(jsonRequest('/api/photos/uploads', { filename: 'a.jpg', contentType: 'image/jpeg' }))).status).toBe(200)
    state.createFeedback.mockResolvedValue({ id: photoId })
    expect((await feedback.POST(jsonRequest('/api/feedback', { id: photoId, kind: 'bug', title: 'Fehler', body: 'Etwas stimmt nicht' }))).status).toBe(201)
    expect((await me.GET()).status).toBe(200)

    state.member = admin
    state.listFeedback.mockResolvedValue([])
    state.listMembers.mockResolvedValue([admin])
    const members = await import('@/app/api/members/route')
    expect((await feedback.GET(new Request('http://127.0.0.1/api/feedback?kind=bug&status=neu'))).status).toBe(200)
    expect((await members.GET()).status).toBe(200)
    state.addMember.mockResolvedValue(admin)
    expect((await members.POST(jsonRequest('/api/members', { email: 'bea@example.com' }))).status).toBe(201)
  })

  it('redirects the auth callback and signs out', async () => {
    const callback = await import('@/app/auth/callback/route')
    const signout = await import('@/app/auth/signout/route')
    const missing = await callback.GET(new Request('http://127.0.0.1/auth/callback'))
    expect(missing.headers.get('location')).toContain('fehler=anmeldung')
    state.exchangeCodeForSession.mockResolvedValue({ error: null })
    state.getUser.mockResolvedValue({ data: { user: { id: member.userId, email: member.email } } })
    state.link.mockResolvedValue(member)
    const ok = await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc&next=/ordner'))
    expect(ok.headers.get('location')).toContain('/ordner')
    state.link.mockResolvedValue(null)
    state.signOut.mockResolvedValue({ error: null })
    const denied = await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc'))
    expect(denied.headers.get('location')).toContain('/nicht-eingeladen')
    state.signOut.mockRejectedValueOnce(new Error('secret'))
    const out = await signout.POST()
    expect(out.status).toBe(500)
    expect(JSON.stringify(await bodyOf(out))).not.toContain('secret')
    state.signOut.mockResolvedValue({ error: null })
    expect((await signout.POST()).status).toBe(200)
  })

  it('covers validation, admin routes and storage failures without leaking details', async () => {
    const photos = await import('@/app/api/photos/route')
    const uploads = await import('@/app/api/photos/uploads/route')
    const thumbs = await import('@/app/api/photos/thumbs/route')
    const feedback = await import('@/app/api/feedback/route')
    const feedbackItem = await import('@/app/api/feedback/[id]/route')
    const feedbackUrl = await import('@/app/api/feedback/[id]/url/route')
    const feedbackUpload = await import('@/app/api/feedback/uploads/route')
    const members = await import('@/app/api/members/route')
    const memberItem = await import('@/app/api/members/[id]/route')
    const e2eUpload = await import('@/app/api/e2e/upload/route')
    const callback = await import('@/app/auth/callback/route')

    expect((await e2eUpload.PUT(new Request('http://127.0.0.1/api/e2e/upload?photoId=1&slot=original', { method: 'PUT', body: 'x' }))).status).toBe(404)
    expect((await feedbackItem.PATCH(jsonRequest('/api/feedback/x', { status: 'nope' }), { params: Promise.resolve({ id: photoId }) })).status).toBe(401)

    state.session = { userId: member.userId! }
    state.member = member
    expect((await photos.GET(new Request('http://127.0.0.1/api/photos?cursor=bad'))).status).toBe(400)
    expect((await photos.POST(jsonRequest('/api/photos', { photoId: 'nope' }))).status).toBe(400)
    state.listPhotoPage.mockResolvedValue({ photos: [], expiresIn: 300, nextCursor: null })
    expect((await photos.GET(new Request('http://127.0.0.1/api/photos'))).status).toBe(200)
    state.completePhotoUpload.mockResolvedValue({ id: photoId })
    expect((await photos.POST(jsonRequest('/api/photos', {
      photoId,
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      width: 1,
      height: 1,
      capturedAt: '2024-01-01T00:00:00.000Z',
    }))).status).toBe(201)
    state.member = { ...member, userId: '99999999-9999-4999-8999-999999999999' }
    expect((await photos.POST(jsonRequest('/api/photos', {}))).status).toBe(403)
    state.member = member

    expect((await uploads.POST(jsonRequest('/api/photos/uploads', {}))).status).toBe(400)
    state.getPhotoRecords.mockResolvedValue([{
      id: photoId,
      ownerId: member.id,
      originalKey: `members/${member.id}/photos/${photoId}/original.jpg`,
      displayKey: `members/${member.id}/photos/${photoId}/display.jpg`,
      thumbKey: `members/${member.id}/photos/${photoId}/thumb.jpg`,
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      byteSize: 10,
      width: 1,
      height: 1,
      capturedAt: '2024-01-01T00:00:00.000Z',
      createdAt: '2024-01-01T00:00:00.000Z',
      uploaderName: 'Ada',
    }])
    expect((await thumbs.POST(jsonRequest('/api/photos/thumbs', { ids: [photoId] }))).status).toBe(200)
    expect((await feedback.GET(new Request('http://127.0.0.1/api/feedback'))).status).toBe(403)
    expect((await feedback.POST(jsonRequest('/api/feedback', { title: 'x' }))).status).toBe(400)
    expect((await feedbackUpload.POST(jsonRequest('/api/feedback/uploads', {}))).status).toBe(400)
    expect((await feedbackUpload.POST(jsonRequest('/api/feedback/uploads', { contentType: 'image/png' }))).status).toBe(200)
    expect((await feedbackItem.PATCH(jsonRequest('/api/feedback/x', { status: 'erledigt' }, 'PATCH'), { params: Promise.resolve({ id: photoId }) })).status).toBe(403)
    expect((await feedbackUrl.GET(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: photoId }) })).status).toBe(403)
    expect((await members.POST(jsonRequest('/api/members', { email: 'nope' }))).status).toBe(403)

    state.member = admin
    state.updateFeedbackStatus.mockResolvedValue(undefined)
    expect((await feedbackItem.PATCH(jsonRequest('/api/feedback/x', { status: 'erledigt' }, 'PATCH'), { params: Promise.resolve({ id: photoId }) })).status).toBe(200)
    expect((await feedbackItem.PATCH(jsonRequest('/api/feedback/x', {}, 'PATCH'), { params: Promise.resolve({ id: photoId }) })).status).toBe(400)
    state.getFeedbackScreenshotKey.mockResolvedValue(null)
    expect((await feedbackUrl.GET(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: photoId }) })).status).toBe(404)
    state.getFeedbackScreenshotKey.mockResolvedValue(`feedback/${admin.id}/${photoId}/screenshot.png`)
    expect((await feedbackUrl.GET(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: photoId }) })).status).toBe(200)
    state.signGet.mockRejectedValueOnce(new Error('bucket secret'))
    const leaked = await feedbackUrl.GET(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: photoId }) })
    expect(leaked.status).toBe(500)
    expect(JSON.stringify(await bodyOf(leaked))).not.toContain('secret')
    state.updateMemberRole.mockResolvedValue(undefined)
    state.removeMember.mockResolvedValue(undefined)
    expect((await memberItem.PATCH(jsonRequest('/api/members/x', { role: 'admin' }, 'PATCH'), { params: Promise.resolve({ id: member.id }) })).status).toBe(200)
    expect((await memberItem.DELETE(new Request('http://127.0.0.1'), { params: Promise.resolve({ id: member.id }) })).status).toBe(200)
    expect((await memberItem.PATCH(jsonRequest('/api/members/x', {}, 'PATCH'), { params: Promise.resolve({ id: 'nope' }) })).status).toBe(400)
    state.addMember.mockResolvedValueOnce(admin)
    expect((await members.POST(jsonRequest('/api/members', { email: 'bea@example.com', displayName: 'Bea' }))).status).toBe(201)
    state.addMember.mockRejectedValue(new Error('db secret'))
    const added = await members.POST(jsonRequest('/api/members', { email: 'bea@example.com' }))
    expect(added.status).toBe(500)
    expect(JSON.stringify(await bodyOf(added))).not.toContain('secret')

    state.exchangeCodeForSession.mockResolvedValue({ error: { message: 'bad code' } })
    expect((await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc'))).headers.get('location')).toContain('fehler=anmeldung')
    state.exchangeCodeForSession.mockResolvedValue({ error: null })
    state.getUser.mockResolvedValue({ data: { user: null } })
    expect((await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc&next=//evil'))).headers.get('location')).toContain('fehler=anmeldung')
    state.getUser.mockResolvedValue({ data: { user: { id: member.userId, email: member.email } } })
    state.link.mockRejectedValue(new Error('service role secret'))
    const broken = await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc&next=/auth/callback'))
    expect(broken.headers.get('location')).toContain('fehler=config')
    expect(broken.headers.get('location')).not.toContain('secret')
    state.link.mockResolvedValue(member)
    const ignoredNext = await callback.GET(new Request('http://127.0.0.1/auth/callback?code=abc&next=//evil'))
    expect(new URL(ignoredNext.headers.get('location') ?? '').pathname).toBe('/gruppe')
  })
})
