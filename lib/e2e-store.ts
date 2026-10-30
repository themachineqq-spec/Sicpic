import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isReasonableCaptureDate } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { E2E_MEMBER_ID, isE2EAuthEnabled } from '@/lib/e2e-guard'
import { LIMITS, photoObjectKeys, sanitizeFilename, videoObjectKeys } from '@/lib/keys'
import { resolveOriginalType, resolveVideoType } from '@/lib/content-types'
import { assertVideoHeader, decodeVideoHeader } from '@/lib/video/magic'
import { assertCompleteParts, assertUploadId, planVideoParts } from '@/lib/video/multipart'
import type { MediaFilter, MediaType, Member, PhotoRecord } from '@/lib/types'

type Slot = 'original' | 'display' | 'thumb'

type StoredPhoto = {
  id: string
  ownerId: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  capturedAt: string
  createdAt: string
  uploaderName: string
  mediaType?: MediaType
  durationMs?: number | null
  codec?: string | null
  hasThumb?: boolean
}

type PendingUpload = {
  uploadId: string
  byteSize: number
  filename: string
  contentType: string
}

type StoreState = {
  blobs: Record<string, number>
  photos: StoredPhoto[]
  uploads?: Record<string, PendingUpload>
}

const storeSlot = process.env.VITEST_POOL_ID ?? 'app'
const storeFile = join(tmpdir(), `sicpic-e2e-store-${storeSlot}.json`)
const blobDir = join(tmpdir(), `sicpic-e2e-blobs-${storeSlot}`)

function blobFile(photoId: string, slot: string): string {
  mkdirSync(blobDir, { recursive: true })
  return join(blobDir, `${photoId}--${slot.replace(/[^a-z0-9]+/gi, '-')}`)
}

function emptyState(): StoreState {
  return { blobs: {}, photos: [] }
}

function loadState(): StoreState {
  try {
    const parsed = JSON.parse(readFileSync(storeFile, 'utf8')) as StoreState
    if (!parsed || typeof parsed.blobs !== 'object' || !Array.isArray(parsed.photos)) return emptyState()
    return parsed
  } catch {
    return emptyState()
  }
}

function saveState(state: StoreState): void {
  writeFileSync(storeFile, JSON.stringify(state))
}

export function resetE2EStore(): void {
  saveState(emptyState())
}

export function e2eUploadGrant(member: Member, filename: string, contentType: string) {
  const original = resolveOriginalType(contentType, filename)
  const photoId = randomUUID()
  const keys = photoObjectKeys(member.id, photoId, original.extension)
  const target = (slot: Slot, key: string, type: string) => ({
    key,
    url: `/api/e2e/upload?photoId=${photoId}&slot=${slot}`,
    contentType: type,
  })
  return {
    photoId: keys.photoId,
    expiresIn: 300,
    original: target('original', keys.original, original.contentType),
    display: target('display', keys.display, 'image/jpeg'),
    thumb: target('thumb', keys.thumb, 'image/jpeg'),
  }
}

export function saveE2EBlob(photoId: string, slot: string, byteSize: number): void {
  if (!isE2EAuthEnabled()) throw new AppError(404, 'not_found', 'Nicht gefunden.')
  if (slot !== 'original' && slot !== 'display' && slot !== 'thumb') {
    throw new AppError(400, 'bad_request', 'Unbekannter Upload-Teil.')
  }
  const state = loadState()
  state.blobs[`${photoId}:${slot}`] = byteSize
  saveState(state)
}

export function completeE2EPhoto(input: {
  member: Member
  photoId: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  capturedAt: string
}) {
  if (!isE2EAuthEnabled()) throw new AppError(404, 'not_found', 'Nicht gefunden.')
  const captured = new Date(input.capturedAt)
  if (!isReasonableCaptureDate(captured)) throw new AppError(400, 'bad_request', 'Das Aufnahmedatum ist ungültig.')
  const state = loadState()
  const originalSize = state.blobs[`${input.photoId}:original`] ?? 0
  const displaySize = state.blobs[`${input.photoId}:display`] ?? 0
  const thumbSize = state.blobs[`${input.photoId}:thumb`] ?? 0
  if (originalSize < 1 || originalSize > LIMITS.originalBytes) {
    throw new AppError(400, 'bad_request', 'Die Originaldatei ist zu groß oder leer.')
  }
  if (displaySize < 1 || displaySize > LIMITS.displayBytes) {
    throw new AppError(400, 'bad_request', 'Die Anzeigeversion ist zu groß oder leer.')
  }
  if (thumbSize < 1 || thumbSize > LIMITS.thumbBytes) {
    throw new AppError(400, 'bad_request', 'Die Vorschau ist zu groß oder leer.')
  }
  const original = resolveOriginalType(input.contentType, input.filename)
  const keys = photoObjectKeys(input.member.id, input.photoId, original.extension)
  state.photos.push({
    id: keys.photoId,
    ownerId: input.member.id,
    filename: sanitizeFilename(input.filename),
    contentType: original.contentType,
    byteSize: originalSize,
    width: input.width,
    height: input.height,
    capturedAt: captured.toISOString(),
    createdAt: new Date().toISOString(),
    uploaderName: input.member.displayName,
  })
  saveState(state)
  return { id: keys.photoId }
}

export function listE2EPhotos(
  scope: 'group' | 'mine',
  cursor: { at: string; id: string } | null,
  media: MediaFilter = 'all',
) {
  const filtered = loadState().photos
    .filter((photo) => (media === 'all' || (photo.mediaType ?? 'photo') === media) && (scope === 'group' || photo.ownerId === E2E_MEMBER_ID))
    .sort((a, b) => (a.capturedAt === b.capturedAt ? b.id.localeCompare(a.id) : a.capturedAt < b.capturedAt ? 1 : -1))
  const start = cursor ? filtered.findIndex((photo) => photo.capturedAt === cursor.at && photo.id === cursor.id) + 1 : 0
  const page = filtered.slice(Math.max(start, 0), Math.max(start, 0) + 24)
  return {
    photos: page.map((photo) => ({
      ...photo,
      mediaType: photo.mediaType ?? 'photo',
      durationMs: photo.durationMs ?? null,
      codec: photo.codec ?? null,
      displayKey: null,
      thumbKey: photo.hasThumb ? 'thumb' : null,
      originalKey: 'original',
      thumbUrl:
        photo.mediaType === 'video'
          ? photo.hasThumb
            ? `/api/e2e/media?photoId=${photo.id}&slot=thumb`
            : ''
          : '/carousel/strand.webp',
    })),
    expiresIn: 300,
    nextCursor: null,
  }
}

function uploadsOf(state: StoreState): Record<string, PendingUpload> {
  state.uploads ??= {}
  return state.uploads
}

export function saveE2EBytes(photoId: string, slot: string, bytes: Uint8Array): string {
  if (!isE2EAuthEnabled()) throw new AppError(404, 'not_found', 'Nicht gefunden.')
  if (!/^(original|display|thumb|part:\d+)$/.test(slot)) {
    throw new AppError(400, 'bad_request', 'Unbekannter Upload-Teil.')
  }
  const state = loadState()
  state.blobs[`${photoId}:${slot}`] = bytes.byteLength
  saveState(state)
  writeFileSync(blobFile(photoId, slot), bytes)
  return `"e2e-${photoId.slice(0, 8)}-${slot.replace(/[^a-z0-9]+/gi, '-')}-${bytes.byteLength}"`
}

export function beginE2EVideo(
  member: Member,
  input: { filename: string; contentType: string; byteSize: number; header: string },
) {
  const video = resolveVideoType(input.contentType, input.filename)
  assertVideoHeader(decodeVideoHeader(input.header), video.extension)
  const plan = planVideoParts(input.byteSize)
  const photoId = randomUUID()
  const uploadId = randomUUID()
  const keys = videoObjectKeys(member.id, photoId, video.extension)
  const state = loadState()
  uploadsOf(state)[photoId] = {
    uploadId,
    byteSize: input.byteSize,
    filename: input.filename,
    contentType: video.contentType,
  }
  saveState(state)
  return {
    photoId: keys.photoId,
    uploadId,
    partSize: plan.partSize,
    partCount: plan.partCount,
    contentType: video.contentType,
    thumb: { url: `/api/e2e/upload?photoId=${keys.photoId}&slot=thumb`, contentType: 'image/webp' },
  }
}

export function e2ePartUrls(photoId: string, uploadId: string, partNumbers: number[]) {
  const state = loadState()
  const pending = uploadsOf(state)[photoId]
  if (!pending || pending.uploadId !== uploadId) throw new AppError(404, 'not_found', 'Der Upload wurde nicht gefunden.')
  assertUploadId(uploadId)
  return {
    parts: partNumbers.map((partNumber) => ({
      partNumber,
      url: `/api/e2e/upload?photoId=${photoId}&slot=part&n=${partNumber}`,
    })),
  }
}

export function completeE2EVideo(input: {
  member: Member
  photoId: string
  uploadId: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  capturedAt: string
  durationMs: number
  codec: string | null
  byteSize: number
  hasThumb: boolean
  parts: { partNumber: number; etag: string }[]
}) {
  if (!isE2EAuthEnabled()) throw new AppError(404, 'not_found', 'Nicht gefunden.')
  const captured = new Date(input.capturedAt)
  if (!isReasonableCaptureDate(captured)) throw new AppError(400, 'bad_request', 'Das Aufnahmedatum ist ungültig.')
  const state = loadState()
  const pending = uploadsOf(state)[input.photoId]
  if (!pending || pending.uploadId !== input.uploadId) throw new AppError(404, 'not_found', 'Der Upload wurde nicht gefunden.')
  const video = resolveVideoType(input.contentType, input.filename)
  const plan = planVideoParts(input.byteSize)
  const parts = assertCompleteParts(input.parts, plan.partCount)
  const chunks = parts.map((part) => {
    const file = blobFile(input.photoId, `part:${part.partNumber}`)
    if (!existsSync(file)) throw new AppError(400, 'bad_request', 'Es fehlen Upload-Teile.')
    return readFileSync(file)
  })
  const original = Buffer.concat(chunks)
  if (original.length !== input.byteSize) throw new AppError(400, 'bad_request', 'Die Videodatei ist unvollständig.')
  writeFileSync(blobFile(input.photoId, 'original'), original)
  if (input.hasThumb && !existsSync(blobFile(input.photoId, 'thumb'))) {
    throw new AppError(400, 'bad_request', 'Die Vorschau ist zu groß oder leer.')
  }
  const keys = videoObjectKeys(input.member.id, input.photoId, video.extension)
  state.photos.push({
    id: keys.photoId,
    ownerId: input.member.id,
    filename: sanitizeFilename(input.filename),
    contentType: video.contentType,
    byteSize: original.length,
    width: input.width,
    height: input.height,
    capturedAt: captured.toISOString(),
    createdAt: new Date().toISOString(),
    uploaderName: input.member.displayName,
    mediaType: 'video',
    durationMs: input.durationMs,
    codec: input.codec,
    hasThumb: input.hasThumb,
  })
  delete uploadsOf(state)[input.photoId]
  saveState(state)
  return { id: keys.photoId }
}

export function abortE2EVideo(photoId: string, uploadId: string): void {
  if (!isE2EAuthEnabled()) throw new AppError(404, 'not_found', 'Nicht gefunden.')
  const state = loadState()
  const pending = uploadsOf(state)[photoId]
  if (pending && pending.uploadId === uploadId) delete uploadsOf(state)[photoId]
  saveState(state)
}

export function readE2EMedia(photoId: string, slot: string): Buffer | null {
  if (!isE2EAuthEnabled()) return null
  const file = blobFile(photoId, slot)
  if (!existsSync(file)) return null
  return readFileSync(file)
}

export function e2ePhotoExists(photoId: string): boolean {
  return loadState().photos.some((photo) => photo.id === photoId)
}

export function e2ePhotoRecord(photoId: string): PhotoRecord | null {
  const photo = loadState().photos.find((item) => item.id === photoId)
  if (!photo) return null
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    originalKey: `members/${photo.ownerId}/photos/${photo.id}/original.mp4`,
    displayKey: null,
    thumbKey: photo.hasThumb ? `members/${photo.ownerId}/photos/${photo.id}/thumb.webp` : null,
    filename: photo.filename,
    contentType: photo.contentType,
    byteSize: photo.byteSize,
    width: photo.width,
    height: photo.height,
    capturedAt: photo.capturedAt,
    createdAt: photo.createdAt,
    uploaderName: photo.uploaderName,
    mediaType: photo.mediaType ?? 'photo',
    durationMs: photo.durationMs ?? null,
    codec: photo.codec ?? null,
  }
}
