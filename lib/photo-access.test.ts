import { describe, expect, it, vi } from 'vitest'
import { AppError } from '@/lib/errors'
import {
  authorizeFeedbackModeration,
  authorizeFeedbackScreenshot,
  authorizePhotoDelete,
  authorizePhotoRead,
  authorizePhotoUpload,
  authorizePhotoUploadFromBody,
  authorizePhotoVariantRead,
  authorizeThumbRefresh,
  requireRequestMember,
} from '@/lib/photo-access'
import { readPresignExpiry } from '@/lib/presign'
import type { ObjectSigner } from '@/lib/presign'
import type { Member, PhotoRecord, SessionIdentity } from '@/lib/types'

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

const other: Member = {
  ...member,
  id: '33333333-3333-4333-8333-333333333333',
  email: 'bea@example.com',
  displayName: 'Bea',
}

const admin: Member = { ...member, role: 'admin' }
const session: SessionIdentity = { userId: member.userId! }
const photoId = '44444444-4444-4444-8444-444444444444'

function signerMock() {
  const puts: { key: string; contentType: string; expiresIn: number }[] = []
  const gets: { key: string; expiresIn: number }[] = []
  const signer: ObjectSigner = {
    async signPut(input) {
      puts.push(input)
      return `https://private.example/${encodeURIComponent(input.key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${input.expiresIn}&X-Amz-Signature=test`
    },
    async signGet(input) {
      gets.push(input)
      return `https://private.example/${encodeURIComponent(input.key)}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=${input.expiresIn}&X-Amz-Signature=test`
    },
  }
  return { signer, puts, gets }
}

function photo(owner: Member): PhotoRecord {
  return {
    id: photoId,
    ownerId: owner.id,
    originalKey: `members/${owner.id}/photos/${photoId}/original.heic`,
    displayKey: `members/${owner.id}/photos/${photoId}/display.jpg`,
    thumbKey: `members/${owner.id}/photos/${photoId}/thumb.jpg`,
    filename: 'IMG.HEIC',
    contentType: 'image/heic',
    byteSize: 10,
    width: 100,
    height: 80,
    capturedAt: '2024-07-01T13:30:45.000Z',
    createdAt: '2024-07-02T13:30:45.000Z',
    uploaderName: owner.displayName,
  }
}

describe('presigned upload URLs', () => {
  it('does not call R2 or Supabase member lookup without a session', async () => {
    const { signer, puts } = signerMock()
    const getMember = vi.fn(async () => member)
    await expect(
      authorizePhotoUpload({
        getSession: async () => null,
        getMember,
        signer,
        photoId,
        filename: 'bild.heic',
        contentType: 'image/heic',
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(getMember).not.toHaveBeenCalled()
    expect(puts).toEqual([])
  })

  it('rejects a signed-in person who is not on the allowlist', async () => {
    const { signer, puts } = signerMock()
    await expect(
      authorizePhotoUpload({
        getSession: async () => session,
        getMember: async () => null,
        signer,
        photoId,
        filename: 'bild.jpg',
        contentType: 'image/jpeg',
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(puts).toEqual([])
  })

  it('issues three short-lived PUT URLs under the member prefix', async () => {
    const { signer, puts } = signerMock()
    const grant = await authorizePhotoUpload({
      getSession: async () => session,
      getMember: async () => member,
      signer,
      photoId,
      filename: 'Urlaub.HEIC',
      contentType: '',
      expiresIn: readPresignExpiry(undefined),
    })

    expect(grant.expiresIn).toBe(300)
    expect(grant.photoId).toBe(photoId)
    expect(puts.map((put) => put.key)).toEqual([
      `members/${member.id}/photos/${photoId}/original.heic`,
      `members/${member.id}/photos/${photoId}/display.jpg`,
      `members/${member.id}/photos/${photoId}/thumb.jpg`,
    ])
    expect(puts.map((put) => put.contentType)).toEqual(['image/heic', 'image/jpeg', 'image/jpeg'])
    expect(puts.every((put) => put.expiresIn === 300)).toBe(true)
    expect(grant.original.url).toContain('X-Amz-Signature=')
    expect(grant.original.url).toContain('X-Amz-Expires=300')
    expect(grant.display.url).not.toContain('public-read')
    for (const target of [grant.original, grant.display, grant.thumb]) {
      expect(target.key.startsWith(`members/${member.id}/`)).toBe(true)
      expect(target.key.includes('..')).toBe(false)
    }
  })

  it('rejects traversal ids and unsupported types before signing', async () => {
    const { signer, puts } = signerMock()
    await expect(
      authorizePhotoUpload({
        getSession: async () => session,
        getMember: async () => member,
        signer,
        photoId: '../secret',
        filename: 'a.jpg',
        contentType: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(AppError)
    await expect(
      authorizePhotoUpload({
        getSession: async () => session,
        getMember: async () => member,
        signer,
        photoId,
        filename: 'a.svg',
        contentType: 'image/svg+xml',
      }),
    ).rejects.toMatchObject({ code: 'unsupported_type' })
    expect(puts).toEqual([])
  })
})

describe('presigned read URLs', () => {
  it('signs only the stored variant key for any group member', async () => {
    const { signer, gets } = signerMock()
    const stored = photo(other)
    const getPhoto = vi.fn(async () => stored)
    const result = await authorizePhotoRead({
      getSession: async () => session,
      getMember: async () => member,
      getPhoto,
      signer,
      photoId,
      variant: 'display',
    })
    expect(gets).toEqual([{ key: stored.displayKey, expiresIn: 300 }])
    expect(result.url).toContain('X-Amz-Signature=')
    expect(result.key).toBe(stored.displayKey)
  })

  it('does not look up a photo when nobody is logged in', async () => {
    const { signer } = signerMock()
    const getPhoto = vi.fn(async () => photo(member))
    await expect(
      authorizePhotoRead({
        getSession: async () => null,
        getMember: async () => member,
        getPhoto,
        signer,
        photoId,
        variant: 'original',
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(getPhoto).not.toHaveBeenCalled()
  })

  it('returns not found without signing when the photo is missing', async () => {
    const { signer, gets } = signerMock()
    await expect(
      authorizePhotoRead({
        getSession: async () => session,
        getMember: async () => member,
        getPhoto: async () => null,
        signer,
        photoId,
        variant: 'thumb',
      }),
    ).rejects.toMatchObject({ status: 404 })
    expect(gets).toEqual([])
  })
})

describe('photo deletion', () => {
  it('deletes a member’s own objects and refuses everyone else’s', async () => {
    const removeRow = vi.fn(async () => undefined)
    const removeObjects = vi.fn(async () => undefined)
    const own = photo(member)
    await authorizePhotoDelete({
      getSession: async () => session,
      getMember: async () => member,
      getPhoto: async () => own,
      deletePhoto: removeRow,
      deleteObjects: removeObjects,
      photoId,
    })
    expect(removeRow).toHaveBeenCalledWith(photoId)
    expect(removeObjects).toHaveBeenCalledWith([own.originalKey, own.displayKey, own.thumbKey])

    const blocked = vi.fn(async () => undefined)
    await expect(
      authorizePhotoDelete({
        getSession: async () => session,
        getMember: async () => member,
        getPhoto: async () => photo(other),
        deletePhoto: blocked,
        deleteObjects: blocked,
        photoId,
      }),
    ).rejects.toMatchObject({ status: 403 })
    expect(blocked).not.toHaveBeenCalled()
  })
})

describe('feedback moderation', () => {
  it('lets admins set a known status and blocks members', async () => {
    await expect(
      authorizeFeedbackModeration({
        getSession: async () => session,
        getMember: async () => member,
        status: 'erledigt',
      }),
    ).rejects.toMatchObject({ status: 403 })

    await expect(
      authorizeFeedbackModeration({
        getSession: async () => session,
        getMember: async () => admin,
        status: 'in_arbeit',
      }),
    ).resolves.toMatchObject({ status: 'in_arbeit' })
  })
})

describe('authentication before validation', () => {
  it('rejects an anonymous upload before parsing the body', async () => {
    const { signer, puts } = signerMock()
    const readBody = vi.fn(async () => {
      throw new Error('body should not be read')
    })
    const parseBody = vi.fn(() => {
      throw new Error('body should not be parsed')
    })
    await expect(
      authorizePhotoUploadFromBody({
        getSession: async () => null,
        getMember: async () => member,
        signer,
        photoId,
        expiresIn: 300,
        readBody,
        parseBody,
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(readBody).not.toHaveBeenCalled()
    expect(parseBody).not.toHaveBeenCalled()
    expect(puts).toEqual([])
  })

  it('rejects an unknown image variant only after the caller is authenticated', async () => {
    const { signer, gets } = signerMock()
    const getPhoto = vi.fn(async () => photo(member))
    await expect(
      authorizePhotoVariantRead({
        getSession: async () => null,
        getMember: async () => member,
        getPhoto,
        signer,
        photoId,
        variant: 'nope',
        expiresIn: 300,
      }),
    ).rejects.toMatchObject({ status: 401 })
    expect(getPhoto).not.toHaveBeenCalled()
    expect(gets).toEqual([])

    await expect(
      authorizePhotoVariantRead({
        getSession: async () => session,
        getMember: async () => member,
        getPhoto,
        signer,
        photoId,
        variant: 'nope',
        expiresIn: 300,
      }),
    ).rejects.toMatchObject({ status: 400, code: 'bad_request' })
  })
})

describe('presign expiry configuration', () => {
  it('defaults to five minutes and rejects a public-length TTL', () => {
    expect(readPresignExpiry(null)).toBe(300)
    expect(readPresignExpiry('300')).toBe(300)
    expect(() => readPresignExpiry('86400')).toThrow(/600/)
    expect(() => readPresignExpiry('59')).toThrow(AppError)
    expect(() => readPresignExpiry('3.5')).toThrow(AppError)
    expect(readPresignExpiry('')).toBe(300)
    expect(readPresignExpiry('60')).toBe(60)
  })
})

describe('thumbnail and screenshot grants', () => {
  it('signs one thumb per known photo and skips an empty id list', async () => {
    const { signer, gets } = signerMock()
    const empty = await authorizeThumbRefresh({
      getSession: async () => session,
      getMember: async () => member,
      signer,
      getPhotos: async () => [],
      ids: [],
      expiresIn: 120,
    })
    expect(empty.thumbs).toEqual([])
    const page = await authorizeThumbRefresh({
      getSession: async () => session,
      getMember: async () => member,
      signer,
      getPhotos: async () => [photo(member)],
      ids: [photoId, photoId],
      expiresIn: 120,
    })
    expect(page.thumbs).toHaveLength(1)
    expect(gets[0]?.expiresIn).toBe(120)
    expect(gets[0]?.key).toContain('/thumb.jpg')
  })

  it('puts a screenshot under the member feedback folder', async () => {
    const { signer, puts } = signerMock()
    const feedbackId = '55555555-5555-4555-8555-555555555555'
    const grant = await authorizeFeedbackScreenshot({
      getSession: async () => session,
      getMember: async () => member,
      signer,
      feedbackId,
      contentType: 'image/png',
      expiresIn: 300,
    })
    expect(grant.key).toBe(`feedback/${member.id}/${feedbackId}/screenshot.png`)
    expect(puts[0]?.contentType).toBe('image/png')
    expect(grant.expiresIn).toBe(300)
  })

  it('refuses a session that does not match the member row', async () => {
    await expect(
      requireRequestMember({
        getSession: async () => ({ userId: '99999999-9999-4999-8999-999999999999' }),
        getMember: async () => member,
      }),
    ).rejects.toMatchObject({ status: 403 })
  })

  it('rejects a signed upload whose expiry is outside the allowed window', async () => {
    const { signer } = signerMock()
    await expect(
      authorizePhotoUpload({
        getSession: async () => session,
        getMember: async () => member,
        signer,
        photoId,
        filename: 'a.jpg',
        contentType: 'image/jpeg',
        expiresIn: 10,
      }),
    ).rejects.toMatchObject({ status: 500, code: 'config' })
  })
})
