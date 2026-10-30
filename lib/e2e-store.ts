import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isReasonableCaptureDate } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { E2E_MEMBER_ID, isE2EAuthEnabled } from '@/lib/e2e-guard'
import { LIMITS, photoObjectKeys, sanitizeFilename } from '@/lib/keys'
import { resolveOriginalType } from '@/lib/content-types'
import type { Member } from '@/lib/types'

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
}

type StoreState = {
  blobs: Record<string, number>
  photos: StoredPhoto[]
}

const storeFile = join(tmpdir(), 'sicpic-e2e-store.json')

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

export function listE2EPhotos(scope: 'group' | 'mine', cursor: { at: string; id: string } | null) {
  const filtered = loadState().photos
    .filter((photo) => scope === 'group' || photo.ownerId === E2E_MEMBER_ID)
    .sort((a, b) => (a.capturedAt === b.capturedAt ? b.id.localeCompare(a.id) : a.capturedAt < b.capturedAt ? 1 : -1))
  const start = cursor ? filtered.findIndex((photo) => photo.capturedAt === cursor.at && photo.id === cursor.id) + 1 : 0
  const page = filtered.slice(Math.max(start, 0), Math.max(start, 0) + 24)
  return {
    photos: page.map((photo) => ({ ...photo, thumbUrl: '/carousel/strand.webp' })),
    expiresIn: 300,
    nextCursor: null,
  }
}
