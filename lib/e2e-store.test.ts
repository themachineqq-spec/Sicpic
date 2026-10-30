import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { E2E_MEMBER_ID } from '@/lib/e2e-guard'
import { completeE2EPhoto, e2eUploadGrant, listE2EPhotos, resetE2EStore, saveE2EBlob } from '@/lib/e2e-store'

const member = {
  id: E2E_MEMBER_ID,
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'e2e@example.com',
  displayName: 'E2E',
  role: 'member' as const,
}

describe('e2e photo store', () => {
  beforeEach(() => {
    resetE2EStore()
  })

  afterEach(() => {
    resetE2EStore()
    delete process.env.SICPIC_E2E_AUTH
    delete process.env.SICPIC_E2E_LOCAL
  })

  it('keeps an upload inside the member folder and lists it newest first', () => {
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    const grant = e2eUploadGrant(member, 'strand.jpg', 'image/jpeg')
    expect(grant.original.key).toBe(`members/${member.id}/photos/${grant.photoId}/original.jpg`)
    expect(grant.original.url).toContain(`photoId=${grant.photoId}`)
    expect(grant.display.contentType).toBe('image/jpeg')
    expect(grant.expiresIn).toBe(300)
    expect(() => saveE2EBlob(grant.photoId, 'other', 10)).toThrow(/Unbekannter/)
    saveE2EBlob(grant.photoId, 'original', 20)
    saveE2EBlob(grant.photoId, 'display', 15)
    saveE2EBlob(grant.photoId, 'thumb', 8)
    const saved = completeE2EPhoto({
      member,
      photoId: grant.photoId,
      filename: 'ordner/strand.jpg',
      contentType: 'image/jpeg',
      width: 10,
      height: 8,
      capturedAt: '2024-07-01T13:30:45.000Z',
    })
    expect(saved.id).toBe(grant.photoId)
    const page = listE2EPhotos('mine', null)
    expect(page.photos.map((photo) => photo.id)).toEqual([grant.photoId])
    expect(page.photos[0]?.thumbUrl).toBe('/carousel/strand.webp')
    expect(listE2EPhotos('mine', { at: page.photos[0]!.capturedAt, id: grant.photoId }).photos).toEqual([])
    expect(listE2EPhotos('group', null).photos).toHaveLength(1)
  })

  it('rejects empty files, bad dates and a disabled bypass', () => {
    process.env.SICPIC_E2E_AUTH = '1'
    process.env.SICPIC_E2E_LOCAL = '1'
    const grant = e2eUploadGrant(member, 'a.jpg', 'image/jpeg')
    expect(() =>
      completeE2EPhoto({
        member,
        photoId: grant.photoId,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: null,
        height: null,
        capturedAt: 'not-a-date',
      }),
    ).toThrow(/Aufnahmedatum/)
    expect(() =>
      completeE2EPhoto({
        member,
        photoId: grant.photoId,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: null,
        height: null,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).toThrow(/Originaldatei/)
    delete process.env.SICPIC_E2E_AUTH
    expect(() => saveE2EBlob(grant.photoId, 'original', 1)).toThrow(/Nicht gefunden/)
    expect(() =>
      completeE2EPhoto({
        member,
        photoId: grant.photoId,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        width: null,
        height: null,
        capturedAt: '2024-07-01T13:30:45.000Z',
      }),
    ).toThrow(/Nicht gefunden/)
  })
})
