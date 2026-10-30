import { resolveOriginalType, resolveScreenshotType } from '@/lib/content-types'
import { AppError } from '@/lib/errors'
import {
  assertSafeObjectKey,
  contentDispositionAttachment,
  feedbackScreenshotKey,
  keyForVariant,
  photoObjectKeys,
} from '@/lib/keys'
import { assertMember } from '@/lib/permissions'
import type { Member, PhotoVariant } from '@/lib/types'

export const DEFAULT_PRESIGN_EXPIRES_SECONDS = 300
export const MIN_PRESIGN_EXPIRES_SECONDS = 60
export const MAX_PRESIGN_EXPIRES_SECONDS = 600

export type ObjectSigner = {
  signPut(input: { key: string; contentType: string; expiresIn: number }): Promise<string>
  signGet(input: { key: string; expiresIn: number; responseContentDisposition?: string }): Promise<string>
}

export type SignedTarget = {
  key: string
  url: string
  contentType: string
}

export type PhotoUploadGrant = {
  photoId: string
  expiresIn: number
  original: SignedTarget
  display: SignedTarget
  thumb: SignedTarget
}

export function readPresignExpiry(raw?: string | null): number {
  if (!raw) return DEFAULT_PRESIGN_EXPIRES_SECONDS
  const value = Number(raw)
  if (!Number.isInteger(value) || value < MIN_PRESIGN_EXPIRES_SECONDS || value > MAX_PRESIGN_EXPIRES_SECONDS) {
    throw new AppError(
      500,
      'config',
      `PRESIGN_EXPIRES_SECONDS muss zwischen ${MIN_PRESIGN_EXPIRES_SECONDS} und ${MAX_PRESIGN_EXPIRES_SECONDS} liegen.`,
    )
  }
  return value
}

export async function issuePhotoUploadUrls(input: {
  member: Member | null
  photoId: string
  filename: string
  contentType: string
  signer: ObjectSigner
  expiresIn?: number
}): Promise<PhotoUploadGrant> {
  assertMember(input.member)
  const original = resolveOriginalType(input.contentType, input.filename)
  const keys = photoObjectKeys(input.member.id, input.photoId, original.extension)
  const expiresIn = input.expiresIn ?? DEFAULT_PRESIGN_EXPIRES_SECONDS
  if (expiresIn < MIN_PRESIGN_EXPIRES_SECONDS || expiresIn > MAX_PRESIGN_EXPIRES_SECONDS) {
    throw new AppError(500, 'config', 'Die Gültigkeit der signierten URL ist ungültig.')
  }

  const [originalUrl, displayUrl, thumbUrl] = await Promise.all([
    input.signer.signPut({ key: keys.original, contentType: original.contentType, expiresIn }),
    input.signer.signPut({ key: keys.display, contentType: 'image/jpeg', expiresIn }),
    input.signer.signPut({ key: keys.thumb, contentType: 'image/jpeg', expiresIn }),
  ])

  return {
    photoId: keys.photoId,
    expiresIn,
    original: { key: keys.original, url: originalUrl, contentType: original.contentType },
    display: { key: keys.display, url: displayUrl, contentType: 'image/jpeg' },
    thumb: { key: keys.thumb, url: thumbUrl, contentType: 'image/jpeg' },
  }
}

export async function issuePhotoReadUrl(input: {
  member: Member | null
  photo: { originalKey: string; displayKey: string | null; thumbKey: string | null; filename?: string } | null
  variant: PhotoVariant
  signer: ObjectSigner
  expiresIn?: number
  download?: boolean
}): Promise<{ url: string; expiresIn: number; key: string }> {
  assertMember(input.member)
  if (!input.photo) {
    throw new AppError(404, 'not_found', 'Foto nicht gefunden.')
  }
  const expiresIn = input.expiresIn ?? DEFAULT_PRESIGN_EXPIRES_SECONDS
  const key = keyForVariant(input.photo, input.variant)
  const responseContentDisposition =
    input.download && input.photo.filename ? contentDispositionAttachment(input.photo.filename) : undefined
  const url = await input.signer.signGet({ key, expiresIn, responseContentDisposition })
  return { url, expiresIn, key }
}

export async function issueFeedbackScreenshotUpload(input: {
  member: Member | null
  feedbackId: string
  contentType: string
  signer: ObjectSigner
  expiresIn?: number
}): Promise<SignedTarget & { expiresIn: number; feedbackId: string }> {
  assertMember(input.member)
  const file = resolveScreenshotType(input.contentType)
  const key = feedbackScreenshotKey(input.member.id, input.feedbackId, file.extension)
  assertSafeObjectKey(key)
  const expiresIn = input.expiresIn ?? DEFAULT_PRESIGN_EXPIRES_SECONDS
  const url = await input.signer.signPut({ key, contentType: file.contentType, expiresIn })
  return { feedbackId: key.split('/')[2] ?? input.feedbackId, key, url, contentType: file.contentType, expiresIn }
}
