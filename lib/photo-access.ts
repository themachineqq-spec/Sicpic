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

async function requireMember(deps: AccessDeps): Promise<Member> {
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
  const member = await requireMember(deps)
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
  const member = await requireMember(deps)
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
  const member = await requireMember(deps)
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
  const member = await requireMember(deps)
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
  const member = await requireMember(deps)
  return issueFeedbackScreenshotUpload({
    member,
    feedbackId: deps.feedbackId,
    contentType: deps.contentType,
    signer: deps.signer,
    expiresIn: deps.expiresIn,
  })
}

export async function authorizeFeedbackModeration(
  deps: AccessDeps & { status: string },
): Promise<{ member: Member; status: FeedbackStatus }> {
  const member = await requireMember(deps)
  assertAdmin(member)
  return { member, status: parseFeedbackStatus(deps.status) }
}
