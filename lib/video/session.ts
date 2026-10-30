import 'server-only'

import { randomUUID } from 'node:crypto'
import { resolveVideoType } from '@/lib/content-types'
import { AppError } from '@/lib/errors'
import { videoObjectKeys } from '@/lib/keys'
import { completeVideoUpload } from '@/lib/photo-service'
import { THUMB_CACHE_CONTROL } from '@/lib/images/thumbs'
import { readPresignExpiry } from '@/lib/presign'
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  createR2Signer,
  signUploadPart,
} from '@/lib/r2'
import type { Member } from '@/lib/types'
import { assertVideoHeader, decodeVideoHeader } from '@/lib/video/magic'
import { assertCompleteParts, assertUploadId, planVideoParts } from '@/lib/video/multipart'

export async function startVideoUpload(
  member: Member,
  input: { filename: string; contentType: string; byteSize: number; header: string },
) {
  const video = resolveVideoType(input.contentType, input.filename)
  assertVideoHeader(decodeVideoHeader(input.header), video.extension)
  const plan = planVideoParts(input.byteSize)
  const photoId = randomUUID()
  const keys = videoObjectKeys(member.id, photoId, video.extension)
  const uploadId = await createMultipartUpload(keys.original, video.contentType)
  const expiresIn = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
  const signer = createR2Signer()
  const [thumbUrl, thumbLargeUrl] = await Promise.all([
    signer.signPut({ key: keys.thumb, contentType: 'image/webp', expiresIn, cacheControl: THUMB_CACHE_CONTROL }),
    signer.signPut({ key: keys.thumbLarge, contentType: 'image/webp', expiresIn, cacheControl: THUMB_CACHE_CONTROL }),
  ])
  return {
    photoId: keys.photoId,
    uploadId,
    partSize: plan.partSize,
    partCount: plan.partCount,
    contentType: video.contentType,
    thumb: { url: thumbUrl, contentType: 'image/webp' },
    thumbLarge: { url: thumbLargeUrl, contentType: 'image/webp' },
  }
}

export async function signVideoParts(
  member: Member,
  input: { photoId: string; uploadId: string; filename: string; contentType: string; partNumbers: number[] },
) {
  const video = resolveVideoType(input.contentType, input.filename)
  const keys = videoObjectKeys(member.id, input.photoId, video.extension)
  const uploadId = assertUploadId(input.uploadId)
  const expiresIn = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
  const parts = await Promise.all(
    input.partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await signUploadPart({ key: keys.original, uploadId, partNumber, expiresIn }),
    })),
  )
  return { parts }
}

export async function finishVideoUpload(
  member: Member,
  input: {
    photoId: string
    uploadId: string
    filename: string
    contentType: string
    byteSize: number
    width: number | null
    height: number | null
    capturedAt: string
    durationMs: number
    codec: string | null
    hasThumb: boolean
    parts: { partNumber: number; etag: string }[]
  },
) {
  const video = resolveVideoType(input.contentType, input.filename)
  const keys = videoObjectKeys(member.id, input.photoId, video.extension)
  const uploadId = assertUploadId(input.uploadId)
  const parts = assertCompleteParts(input.parts, planVideoParts(input.byteSize).partCount)
  try {
    await completeMultipartUpload({ key: keys.original, uploadId, parts })
  } catch {
    throw new AppError(500, 'server', 'Das Video konnte nicht zusammengesetzt werden.')
  }
  return completeVideoUpload({ member, ...input, contentType: video.contentType })
}

export async function cancelVideoUpload(
  member: Member,
  input: { photoId: string; uploadId: string; filename: string; contentType: string },
) {
  const video = resolveVideoType(input.contentType, input.filename)
  const keys = videoObjectKeys(member.id, input.photoId, video.extension)
  const uploadId = assertUploadId(input.uploadId)
  try {
    await abortMultipartUpload(keys.original, uploadId)
  } catch (error) {
    const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
    if (name !== 'NoSuchUpload') throw new AppError(500, 'server', 'Der Upload konnte nicht abgebrochen werden.')
  }
}
