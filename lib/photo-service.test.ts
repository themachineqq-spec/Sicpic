import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}))
const r2 = vi.hoisted(() => ({
  headR2Object: vi.fn(),
  createR2Signer: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabase }))
vi.mock('@/lib/r2', () => ({
  headR2Object: r2.headR2Object,
  createR2Signer: r2.createR2Signer,
  deleteR2Objects: vi.fn(),
  createLazyR2Signer: vi.fn(),
}))

const member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member' as const,
}

describe('photo service', () => {
  beforeEach(() => {
    supabase.rpc.mockReset()
    supabase.from.mockReset()
    r2.headR2Object.mockReset()
    r2.createR2Signer.mockReset()
    r2.createR2Signer.mockReturnValue({
      signGet: async ({ key, expiresIn }: { key: string; expiresIn: number }) => `https://signed.example/${key}?e=${expiresIn}`,
    })
  })

  it('signs only thumbnails and hides database errors', async () => {
    const { listPhotoPage } = await import('@/lib/photo-service')
    supabase.rpc.mockResolvedValue({
      data: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          owner_id: member.id,
          original_key: 'members/a/original.jpg',
          display_key: 'members/a/display.jpg',
          thumb_key: 'members/a/thumb.jpg',
          filename: 'a.jpg',
          content_type: 'image/jpeg',
          byte_size: 10,
          width: 1,
          height: 1,
          captured_at: '2024-07-01T13:30:45.000Z',
          created_at: '2024-07-02T00:00:00.000Z',
          uploader_name: 'Ada',
        },
      ],
      error: null,
    })
    const page = await listPhotoPage('group', null)
    expect(page.photos[0]?.thumbUrl).toContain('thumb.jpg')
    expect(JSON.stringify(page)).not.toContain('original.jpg')
    supabase.rpc.mockResolvedValue({ data: null, error: { message: 'password authentication failed' } })
    await expect(listPhotoPage('mine', null)).rejects.toMatchObject({
      status: 500,
      message: 'Die Fotoliste konnte nicht geladen werden.',
    })
  })

  it('stores metadata only after the objects exist and within size limits', async () => {
    const { completePhotoUpload } = await import('@/lib/photo-service')
    r2.headR2Object
      .mockResolvedValueOnce({ byteSize: 100, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ byteSize: 80, contentType: 'image/jpeg' })
      .mockResolvedValueOnce({ byteSize: 20, contentType: 'image/jpeg' })
    const insert = vi.fn(() => ({ error: null }))
    supabase.from.mockReturnValue({ insert })
    const saved = await completePhotoUpload({
      member,
      photoId: '44444444-4444-4444-8444-444444444444',
      filename: 'a.jpg',
      contentType: 'image/jpeg',
      width: 10,
      height: 8,
      capturedAt: '2024-07-01T13:30:45.000Z',
    })
    expect(saved.id).toBe('44444444-4444-4444-8444-444444444444')
    r2.headR2Object.mockResolvedValue({ byteSize: 0 })
    await expect(
      completePhotoUpload({
        member,
        photoId: '55555555-5555-4555-8555-555555555555',
        filename: 'b.jpg',
        contentType: 'image/jpeg',
        width: null,
        height: null,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).rejects.toMatchObject({ status: 400 })
  })

  it('maps unique violations and generic storage failures', async () => {
    const { completePhotoUpload, getPhotoRecord, deletePhotoRecord } = await import('@/lib/photo-service')
    r2.headR2Object.mockResolvedValue({ byteSize: 10, contentType: 'image/jpeg' })
    supabase.from.mockReturnValueOnce({ insert: () => ({ error: { code: '23505', message: 'duplicate key secret' } }) })
    await expect(
      completePhotoUpload({
        member,
        photoId: '44444444-4444-4444-8444-444444444444',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).rejects.toMatchObject({ status: 409 })
    supabase.from.mockReturnValueOnce({ insert: () => ({ error: { code: 'XX', message: 'internal schema secret' } }) })
    await expect(
      completePhotoUpload({
        member,
        photoId: '66666666-6666-4666-8666-666666666666',
        filename: 'c.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).rejects.toMatchObject({ message: 'Die Fotodaten konnten nicht gespeichert werden.' })
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => chain,
      maybeSingle: async () => ({ data: null, error: { message: 'secret' } }),
      delete: () => chain,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { message: 'secret' } }).then(resolve, reject),
    }
    supabase.from.mockReturnValue(chain)
    await expect(getPhotoRecord('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({ status: 500 })
    await expect(deletePhotoRecord('44444444-4444-4444-8444-444444444444')).rejects.toMatchObject({ status: 500 })
  })

  it('pages the timeline and names the uploader from the member row', async () => {
    const { listPhotoPage, getPhotoRecords, mapPhoto } = await import('@/lib/photo-service')
    const row = (id: string, name: string | null) => ({
      id,
      owner_id: member.id,
      original_key: `members/${member.id}/photos/${id}/original.jpg`,
      display_key: `members/${member.id}/photos/${id}/display.jpg`,
      thumb_key: `members/${member.id}/photos/${id}/thumb.jpg`,
      filename: 'a.jpg',
      content_type: 'image/jpeg',
      byte_size: 12,
      width: null,
      height: null,
      captured_at: '2024-07-01T13:30:45.000Z',
      created_at: '2024-07-02T00:00:00.000Z',
      uploader_name: name,
      members: [{ display_name: '  ', email: 'ada@example.com' }],
    })
    const ids = Array.from({ length: 25 }, (_, index) => `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`)
    supabase.rpc.mockResolvedValue({ data: ids.map((id, index) => row(id, index === 0 ? null : 'Ada')), error: null })
    const page = await listPhotoPage('group', { at: '2024-08-01T00:00:00.000Z', id: ids[0]! })
    expect(page.photos).toHaveLength(24)
    expect(page.nextCursor).toContain(ids[23])
    expect(page.photos[0]?.uploaderName).toBe('ada')
    supabase.rpc.mockResolvedValue({ data: [], error: null })
    await expect(listPhotoPage('mine', null)).resolves.toMatchObject({ photos: [], nextCursor: null })
    expect(mapPhoto(row(ids[0]!, null)).byteSize).toBe(12)

    const chain = {
      select: () => chain,
      in: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: row(ids[0]!, 'Ada'), error: null }),
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve({ data: [row(ids[0]!, 'Bea')], error: null }).then(resolve, reject),
    }
    supabase.from.mockReturnValue(chain)
    const { getPhotoRecord } = await import('@/lib/photo-service')
    await expect(getPhotoRecord(ids[0]!)).resolves.toMatchObject({ uploaderName: 'Ada' })
    await expect(getPhotoRecords([ids[0]!])).resolves.toHaveLength(1)
    await expect(getPhotoRecords([])).resolves.toEqual([])
    chain.then = (resolve, reject) => Promise.resolve({ data: null, error: { message: 'secret' } }).then(resolve, reject)
    await expect(getPhotoRecords([ids[0]!])).rejects.toMatchObject({ status: 500 })
  })

  it('rejects an unreasonable date and oversized derivatives', async () => {
    const { completePhotoUpload } = await import('@/lib/photo-service')
    await expect(
      completePhotoUpload({
        member,
        photoId: '44444444-4444-4444-8444-444444444444',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '1960-01-01T00:00:00.000Z',
      }),
    ).rejects.toMatchObject({ status: 400 })
    r2.headR2Object
      .mockResolvedValueOnce({ byteSize: 10 })
      .mockResolvedValueOnce({ byteSize: 20 * 1024 * 1024 })
      .mockResolvedValueOnce({ byteSize: 10 })
    await expect(
      completePhotoUpload({
        member,
        photoId: '44444444-4444-4444-8444-444444444444',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).rejects.toMatchObject({ message: 'Die Anzeigeversion ist zu groß oder leer.' })
    r2.headR2Object
      .mockResolvedValueOnce({ byteSize: 10 })
      .mockResolvedValueOnce({ byteSize: 10 })
      .mockResolvedValueOnce({ byteSize: 2 * 1024 * 1024 })
    await expect(
      completePhotoUpload({
        member,
        photoId: '44444444-4444-4444-8444-444444444444',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: 1,
        height: 1,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).rejects.toMatchObject({ message: 'Die Vorschau ist zu groß oder leer.' })
  })

  it('stores a video only when the finished object matches the declared size', async () => {
    const { completeVideoUpload } = await import('@/lib/photo-service')
    const input = {
      member,
      photoId: '44444444-4444-4444-8444-444444444444',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      width: 16,
      height: 9,
      capturedAt: '2024-07-01T12:00:00.000Z',
      durationMs: 1000,
      codec: 'h264' as string | null,
      byteSize: 1000,
      hasThumb: false,
    }
    await expect(completeVideoUpload({ ...input, capturedAt: '1800-01-01T00:00:00.000Z' })).rejects.toMatchObject({ status: 400 })
    r2.headR2Object.mockResolvedValueOnce({ byteSize: 10 })
    await expect(completeVideoUpload(input)).rejects.toMatchObject({ message: 'Die Videodatei ist unvollständig.' })
    r2.headR2Object.mockResolvedValueOnce({ byteSize: 1000 }).mockResolvedValueOnce({ byteSize: 2 * 1024 * 1024 })
    await expect(completeVideoUpload({ ...input, hasThumb: true })).rejects.toMatchObject({ message: 'Die Vorschau ist zu groß oder leer.' })
    r2.headR2Object.mockResolvedValue({ byteSize: 1000 })
    supabase.from.mockReturnValueOnce({ insert: () => ({ error: null }) })
    await expect(completeVideoUpload({ ...input, hasThumb: true })).resolves.toEqual({ id: input.photoId })
    supabase.from.mockReturnValueOnce({ insert: () => ({ error: { code: '23505', message: 'duplicate secret' } }) })
    await expect(completeVideoUpload(input)).rejects.toMatchObject({ status: 409 })
    supabase.from.mockReturnValueOnce({ insert: () => ({ error: { code: 'XX', message: 'secret schema' } }) })
    await expect(completeVideoUpload(input)).rejects.toMatchObject({ message: 'Die Videodaten konnten nicht gespeichert werden.' })
  })
})
