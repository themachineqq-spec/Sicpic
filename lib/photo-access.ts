import { AppError } from '@/lib/errors'
import { LIMITS } from '@/lib/keys'
import { assertAdmin, assertCanDeletePhoto, parseFeedbackStatus } from '@/lib/permissions'
import {
  issueFeedbackScreenshotUpload,
  issuePhotoReadUrl,
  issuePhotoUploadUrls,
  type ObjectSigner,
} from '@/lib/presign'
import type { FeedbackStatus, Member, PhotoRecord, PhotoVariant, SessionIdentity } from '@/lib/types'

export type AccessDeps = {
  getSession: () => Promise<SessionIdentity | null>
  getMember: () => Promise<Member | null>
}

export async function requireRequestMember(deps: AccessDeps): Promise<Member> {
  const session = await deps.getSession()
  if (!session) {
    throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  }
  const member = await deps.getMember()
  if (!member || (member.userId && member.userId !== session.userId)) {
    throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
  }
  return member
}

export async function authorizePhotoUpload(
  deps: AccessDeps & {
    signer: ObjectSigner
    photoId: string
    filename: string
    contentType: string
    expiresIn?: number
  },
) {
  const member = await requireRequestMember(deps)
  return issuePhotoUploadUrls({
    member,
    photoId: deps.photoId,
    filename: deps.filename,
    contentType: deps.contentType,
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

export async function authorizePhotoRead(
  deps: AccessDeps & {
    signer: ObjectSigner
    getPhoto: (id: string) => Promise<PhotoRecord | null>
    photoId: string
    variant: PhotoVariant
    expiresIn?: number
  },
) {
  const member = await requireRequestMember(deps)
  const photo = await deps.getPhoto(deps.photoId)
  return issuePhotoReadUrl({
    member,
    photo,
    variant: deps.variant,
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

export async function authorizePhotoDelete(
  deps: AccessDeps & {
    getPhoto: (id: string) => Promise<PhotoRecord | null>
    deletePhoto: (id: string) => Promise<void>
    deleteObjects: (keys: string[]) => Promise<void>
    photoId: string
  },
) {
  const member = await requireRequestMember(deps)
  const photo = await deps.getPhoto(deps.photoId)
  if (!photo) throw new AppError(404, 'not_found', 'Foto nicht gefunden.')
  assertCanDeletePhoto(member, photo)
  await deps.deletePhoto(photo.id)
  await deps.deleteObjects([photo.originalKey, photo.displayKey, photo.thumbKey])
  return { id: photo.id }
}

export async function authorizeThumbRefresh(
  deps: AccessDeps & {
    signer: ObjectSigner
    getPhotos: (ids: string[]) => Promise<PhotoRecord[]>
    ids: string[]
    expiresIn?: number
  },
) {
  const member = await requireRequestMember(deps)
  const unique = [...new Set(deps.ids)].slice(0, LIMITS.thumbBatch)
  const photos = unique.length ? await deps.getPhotos(unique) : []
  const thumbs = await Promise.all(
    photos.map(async (photo) => {
      const signed = await issuePhotoReadUrl({
        member,
        photo,
        variant: 'thumb',
        signer: deps.signer,
        expiresIn: deps.expiresIn,
      })
      return { id: photo.id, thumbUrl: signed.url, expiresIn: signed.expiresIn }
    }),
  )
  return { thumbs }
}

export async function authorizeFeedbackScreenshot(
  deps: AccessDeps & {
    signer: ObjectSigner
    feedbackId: string
    contentType: string
    expiresIn?: number
  },
) {
  const member = await requireRequestMember(deps)
  return issueFeedbackScreenshotUpload({
    member,
    feedbackId: deps.feedbackId,
    contentType: deps.contentType,
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

const PHOTO_VARIANTS = new Set<PhotoVariant>(['original', 'display', 'thumb'])

export function parsePhotoVariant(value: string | null): PhotoVariant {
  if (value && PHOTO_VARIANTS.has(value as PhotoVariant)) return value as PhotoVariant
  throw new AppError(400, 'bad_request', 'Unbekannte Bildvariante.')
}

export async function authorizePhotoUploadFromBody(
  deps: AccessDeps & {
    signer: ObjectSigner
    photoId: string
    expiresIn?: number
    readBody: () => Promise<unknown>
    parseBody: (body: unknown) => { filename: string; contentType?: string }
  },
) {
  const member = await requireRequestMember(deps)
  const input = deps.parseBody(await deps.readBody())
  return issuePhotoUploadUrls({
    member,
    photoId: deps.photoId,
    filename: input.filename,
    contentType: input.contentType ?? '',
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

export async function authorizePhotoVariantRead(
  deps: AccessDeps & {
    signer: ObjectSigner
    getPhoto: (id: string) => Promise<PhotoRecord | null>
    photoId: string
    variant: string | null
    expiresIn?: number
  },
) {
  const member = await requireRequestMember(deps)
  const variant = parsePhotoVariant(deps.variant)
  const photo = await deps.getPhoto(deps.photoId)
  return issuePhotoReadUrl({
    member,
    photo,
    variant,
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

export async function authorizeFeedbackModeration(
  deps: AccessDeps & { status: string },
): Promise<{ member: Member; status: FeedbackStatus }> {
  const member = await requireRequestMember(deps)
  assertAdmin(member)
  return { member, status: parseFeedbackStatus(deps.status) }
}
