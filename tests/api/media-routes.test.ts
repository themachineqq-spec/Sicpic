import { headers } from 'next/headers'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/lib/types'

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server')
  return { ...actual, connection: async () => undefined }
})

const state = vi.hoisted(() => ({
  session: null as { userId: string } | null,
  member: null as Member | null,
  createMultipartUpload: vi.fn(async () => 'upload-12345678'),
  signUploadPart: vi.fn(async ({ partNumber }: { partNumber: number }) => `https://signed.example/part-${partNumber}`),
  completeMultipartUpload: vi.fn(async () => undefined),
  abortMultipartUpload: vi.fn(async () => undefined),
  completeVideoUpload: vi.fn(async () => ({ id: '44444444-4444-4444-8444-444444444444' })),
}))

vi.mock('@/lib/auth', () => ({
  createRequestAccess: () => ({
    getSession: async () => state.session,
    getMember: async () => state.member,
  }),
}))
vi.mock('@/lib/r2', () => ({
  createMultipartUpload: state.createMultipartUpload,
  signUploadPart: state.signUploadPart,
  completeMultipartUpload: state.completeMultipartUpload,
  abortMultipartUpload: state.abortMultipartUpload,
  createR2Signer: () => ({ signPut: async () => 'https://signed.example/thumb' }),
}))
vi.mock('@/lib/photo-service', () => ({
  completeVideoUpload: state.completeVideoUpload,
  listPhotoPage: vi.fn(),
}))

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

function ftyp(brand: string) {
  const bytes = Buffer.alloc(16)
  bytes.writeUInt32BE(16, 0)
  bytes.write('ftyp', 4, 'ascii')
  bytes.write(brand, 8, 'ascii')
  return bytes.toString('base64')
}

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://127.0.0.1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('video upload routes', () => {
  beforeEach(() => {
    state.session = null
    state.member = null
    state.createMultipartUpload.mockClear()
    state.completeMultipartUpload.mockClear()
    state.abortMultipartUpload.mockClear()
    state.completeVideoUpload.mockClear()
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
    vi.mocked(headers).mockResolvedValue(new Headers())
  })

  it('rejects anonymous callers before it looks at the file', async () => {
    const uploads = await import('@/app/api/media/uploads/route')
    const parts = await import('@/app/api/media/uploads/parts/route')
    const complete = await import('@/app/api/media/uploads/complete/route')
    const abort = await import('@/app/api/media/uploads/abort/route')
    const photos = await import('@/app/api/photos/route')
    expect((await uploads.POST(jsonRequest('/api/media/uploads', {}))).status).toBe(401)
    expect((await parts.POST(jsonRequest('/api/media/uploads/parts', {}))).status).toBe(401)
    expect((await complete.POST(jsonRequest('/api/media/uploads/complete', {}))).status).toBe(401)
    expect((await abort.POST(jsonRequest('/api/media/uploads/abort', {}))).status).toBe(401)
    state.session = { userId: member.userId! }
    state.member = null
    expect((await uploads.POST(jsonRequest('/api/media/uploads', {}))).status).toBe(403)
    state.member = member
    expect((await photos.GET(new Request('http://127.0.0.1/api/photos?media=nope'))).status).toBe(400)
  })

  it('presigns parts for a member and hides storage failures', async () => {
    state.session = { userId: member.userId! }
    state.member = member
    const uploads = await import('@/app/api/media/uploads/route')
    const parts = await import('@/app/api/media/uploads/parts/route')
    const complete = await import('@/app/api/media/uploads/complete/route')
    const abort = await import('@/app/api/media/uploads/abort/route')
    const started = await uploads.POST(jsonRequest('/api/media/uploads', {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      byteSize: 1000,
      header: ftyp('isom'),
    }))
    expect(started.status).toBe(200)
    const grant = (await started.json()) as { photoId: string; uploadId: string; partCount: number }
    expect(grant.partCount).toBe(1)
    expect(grant.uploadId).toBe('upload-12345678')
    const signed = await parts.POST(jsonRequest('/api/media/uploads/parts', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      partNumbers: [1],
    }))
    expect(signed.status).toBe(200)
    const done = await complete.POST(jsonRequest('/api/media/uploads/complete', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      byteSize: 1000,
      width: 160,
      height: 90,
      capturedAt: '2024-07-01T12:00:00.000Z',
      durationMs: 1000,
      codec: 'h264',
      hasThumb: false,
      parts: [{ partNumber: 1, etag: 'abc' }],
    }))
    expect(done.status).toBe(201)
    expect(state.completeMultipartUpload).toHaveBeenCalled()
    state.completeMultipartUpload.mockRejectedValueOnce(new Error('bucket secret'))
    const failed = await complete.POST(jsonRequest('/api/media/uploads/complete', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      byteSize: 1000,
      width: null,
      height: null,
      capturedAt: '2024-07-01T12:00:00.000Z',
      durationMs: 1000,
      codec: null,
      hasThumb: false,
      parts: [{ partNumber: 1, etag: 'abc' }],
    }))
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('secret')
    expect((await abort.POST(jsonRequest('/api/media/uploads/abort', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    }))).status).toBe(200)
    state.abortMultipartUpload.mockRejectedValueOnce(Object.assign(new Error('gone'), { name: 'NoSuchUpload' }))
    expect((await abort.POST(jsonRequest('/api/media/uploads/abort', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    }))).status).toBe(200)
    state.abortMultipartUpload.mockRejectedValueOnce(new Error('secret abort'))
    const aborted = await abort.POST(jsonRequest('/api/media/uploads/abort', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mp4',
      contentType: 'video/mp4',
    }))
    expect(aborted.status).toBe(500)
    expect(JSON.stringify(await aborted.json())).not.toContain('secret')
    expect((await uploads.POST(jsonRequest('/api/media/uploads', {
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      byteSize: 1000,
      header: Buffer.from('not-a-video!!!!').toString('base64'),
    }))).status).toBe(400)
  })

  it('keeps an e2e multipart upload on loopback without calling R2', async () => {
    state.session = { userId: member.userId! }
    state.member = member
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    vi.mocked(headers).mockResolvedValue(new Headers({ host: '127.0.0.1:4173' }))
    const { resetE2EStore, saveE2EBytes } = await import('@/lib/e2e-store')
    resetE2EStore()
    const uploads = await import('@/app/api/media/uploads/route')
    const parts = await import('@/app/api/media/uploads/parts/route')
    const complete = await import('@/app/api/media/uploads/complete/route')
    const put = await import('@/app/api/e2e/upload/route')
    const started = await uploads.POST(jsonRequest('/api/media/uploads', {
      filename: 'clip.mov',
      contentType: 'video/quicktime',
      byteSize: 8,
      header: ftyp('qt  '),
    }))
    expect(started.status).toBe(200)
    expect(state.createMultipartUpload).not.toHaveBeenCalled()
    const grant = (await started.json()) as { photoId: string; uploadId: string }
    const signed = await parts.POST(jsonRequest('/api/media/uploads/parts', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mov',
      contentType: 'video/quicktime',
      partNumbers: [1],
    }))
    const part = ((await signed.json()) as { parts: { url: string }[] }).parts[0]
    const stored = await put.PUT(new Request(`http://127.0.0.1${part?.url ?? ''}`, { method: 'PUT', body: Buffer.alloc(8) }))
    expect(stored.headers.get('etag')).toBeTruthy()
    const done = await complete.POST(jsonRequest('/api/media/uploads/complete', {
      photoId: grant.photoId,
      uploadId: grant.uploadId,
      filename: 'clip.mov',
      contentType: 'video/quicktime',
      byteSize: 8,
      width: null,
      height: null,
      capturedAt: '2024-07-01T12:00:00.000Z',
      durationMs: 1000,
      codec: 'hevc',
      hasThumb: false,
      parts: [{ partNumber: 1, etag: stored.headers.get('etag') ?? '' }],
    }))
    expect(done.status).toBe(201)
    resetE2EStore()
    const media = await import('@/app/api/e2e/media/route')
    saveE2EBytes(grant.photoId, 'original', Buffer.alloc(8, 7))
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    const full = await media.GET(new Request(`http://127.0.0.1/api/e2e/media?photoId=${grant.photoId}&slot=original`))
    expect(full.status).toBe(200)
    const partial = await media.GET(new Request(`http://127.0.0.1/api/e2e/media?photoId=${grant.photoId}&slot=original`, { headers: { range: 'bytes=1-3' } }))
    expect(partial.status).toBe(206)
    const missing = await media.GET(new Request(`http://127.0.0.1/api/e2e/media?photoId=${grant.photoId}&slot=original`, { headers: { range: 'bytes=20-30' } }))
    expect(missing.status).toBe(416)
    delete process.env.SICPIC_E2E_AUTH
    expect((await media.GET(new Request('http://127.0.0.1/api/e2e/media?photoId=1'))).status).toBe(404)
    resetE2EStore()
  })
})
