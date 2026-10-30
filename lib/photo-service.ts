import 'server-only'

import { resolveOriginalType, resolveVideoType } from '@/lib/content-types'
import { isReasonableCaptureDate } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { stableSigningDate, stableThumbExpiry } from '@/lib/images/thumbs'
import { LIMITS, photoObjectKeys, photoThumbKeys, sanitizeFilename, videoObjectKeys } from '@/lib/keys'
import { readPresignExpiry } from '@/lib/presign'
import { completeE2EPhoto, listE2EPeople, listE2EPhotos } from '@/lib/e2e-store'
import { isE2ERequest } from '@/lib/e2e-guard'
import { createR2Signer, headR2Object } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import type { MediaFilter, Member, PhotoRecord, PhotoScope } from '@/lib/types'

type PhotoRow = {
  id: string
  owner_id: string
  original_key: string
  display_key: string | null
  thumb_key: string | null
  thumb_large_key?: string | null
  blur_data?: string | null
  filename: string
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  captured_at: string
  created_at: string
  media_type?: string | null
  duration_ms?: number | null
  codec?: string | null
  uploader_name?: string | null
  members?: { display_name: string | null; email: string } | { display_name: string | null; email: string }[] | null
}

function uploaderName(row: PhotoRow): string {
  if (row.uploader_name) return row.uploader_name
  const member = Array.isArray(row.members) ? row.members[0] : row.members
  const name = member?.display_name?.trim()
  if (name) return name
  return member?.email.split('@')[0] ?? 'Unbekannt'
}

export function mapPhoto(row: PhotoRow): PhotoRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    originalKey: row.original_key,
    displayKey: row.display_key,
    thumbKey: row.thumb_key,
    filename: row.filename,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    width: row.width,
    height: row.height,
    capturedAt: new Date(row.captured_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
    uploaderName: uploaderName(row),
    mediaType: row.media_type === 'video' ? 'video' : 'photo',
    durationMs: row.duration_ms == null ? null : Number(row.duration_ms),
    codec: row.codec ?? null,
    thumbLargeKey: row.thumb_large_key ?? null,
    blurData: row.blur_data ?? null,
  }
}

const photoColumns = 'id, owner_id, original_key, display_key, thumb_key, thumb_large_key, filename, content_type, byte_size, width, height, captured_at, created_at, media_type, duration_ms, codec, blur_data, members(display_name, email)'

export async function getPhotoRecord(id: string): Promise<PhotoRecord | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('photos').select(photoColumns).eq('id', id).maybeSingle()
  if (error) throw new AppError(500, 'server', 'Foto konnte nicht geladen werden.')
  return data ? mapPhoto(data as PhotoRow) : null
}

export async function getPhotoRecords(ids: string[]): Promise<PhotoRecord[]> {
  if (ids.length === 0) return []
  const supabase = await createClient()
  const { data, error } = await supabase.from('photos').select(photoColumns).in('id', ids)
  if (error) throw new AppError(500, 'server', 'Fotos konnten nicht geladen werden.')
  return ((data ?? []) as PhotoRow[]).map(mapPhoto)
}

export async function deletePhotoRecord(id: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('photos').delete().eq('id', id)
  if (error) throw new AppError(500, 'server', 'Foto konnte nicht gelöscht werden.')
}

export type PhotoListFilter = {
  ownerId?: string | null
  from?: string | null
  to?: string | null
}

export async function listPhotoMonths(scope: PhotoScope, media: MediaFilter, filter: PhotoListFilter = {}) {
  if (await isE2ERequest()) return []
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('photo_months', {
    p_scope: scope,
    p_media: media,
    p_owner: filter.ownerId ?? null,
    p_from: filter.from ?? null,
    p_to: filter.to ?? null,
  })
  if (error) throw new AppError(500, 'server', 'Die Monate konnten nicht geladen werden.')
  return ((data ?? []) as { month_key: string; photo_count: number }[]).map((row) => ({
    monthKey: row.month_key,
    photoCount: Number(row.photo_count),
  }))
}

export async function attachThumbSet(id: string, thumbKey: string, thumbLargeKey: string, blurData: string) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('attach_thumb_set', {
    p_id: id,
    p_thumb: thumbKey,
    p_large: thumbLargeKey,
    p_blur: blurData,
  })
  if (error) throw new AppError(403, 'forbidden', 'Die Vorschau konnte nicht gespeichert werden.')
}

export async function listUploaders(scope: PhotoScope): Promise<{ id: string; name: string }[]> {
  if (await isE2ERequest()) return listE2EPeople(scope)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('list_uploaders', { p_scope: scope })
  if (error) throw new AppError(500, 'server', 'Die Personen konnten nicht geladen werden.')
  return ((data ?? []) as { id: string; display_name: string }[]).map((row) => ({
    id: row.id,
    name: row.display_name,
  }))
}

export async function listPhotoPage(
  scope: PhotoScope,
  cursor: { at: string; id: string } | null,
  media: MediaFilter = 'all',
  filter: PhotoListFilter = {},
) {
  if (await isE2ERequest()) return listE2EPhotos(scope, cursor, media, filter)
  const supabase = await createClient()
  const limit = LIMITS.pageSize
  const { data, error } = await supabase.rpc('list_photos', {
    p_scope: scope,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit + 1,
    p_media: media,
    p_owner: filter.ownerId ?? null,
    p_from: filter.from ?? null,
    p_to: filter.to ?? null,
  })
  if (error) throw new AppError(500, 'server', 'Die Fotoliste konnte nicht geladen werden.')
  const rows = ((data ?? []) as PhotoRow[]).map(mapPhoto)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const configuredExpiry = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
  const expiresIn = stableThumbExpiry(configuredExpiry)
  const signingDate = stableSigningDate()
  const signer = page.some((photo) => photo.thumbKey) ? createR2Signer() : null
  const photos = await Promise.all(
    page.map(async (photo) => {
      if (!photo.thumbKey || !signer) return { ...publicPhoto(photo), thumbUrl: '', thumbUrlLarge: null }
      const [thumbUrl, thumbUrlLarge] = await Promise.all([
        signer.signGet({ key: photo.thumbKey, expiresIn, signingDate }),
        photo.thumbLargeKey ? signer.signGet({ key: photo.thumbLargeKey, expiresIn, signingDate }) : Promise.resolve(null),
      ])
      return { ...publicPhoto(photo), thumbUrl, thumbUrlLarge }
    }),
  )
  const last = page.at(-1)
  return {
    photos,
    expiresIn,
    nextCursor: hasMore && last ? `${last.capturedAt}|${last.id}` : null,
  }
}

export type PublicPhoto = ReturnType<typeof publicPhoto> & { thumbUrl?: string }

export function publicPhoto(photo: PhotoRecord) {
  return {
    id: photo.id,
    ownerId: photo.ownerId,
    filename: photo.filename,
    contentType: photo.contentType,
    byteSize: photo.byteSize,
    width: photo.width,
    height: photo.height,
    capturedAt: photo.capturedAt,
    createdAt: photo.createdAt,
    uploaderName: photo.uploaderName,
    mediaType: photo.mediaType,
    durationMs: photo.durationMs,
    codec: photo.codec,
    blurData: photo.blurData,
  }
}

export async function completePhotoUpload(input: {
  member: Member
  photoId: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  capturedAt: string
  blurData?: string | null
  thumbContentType?: 'image/webp' | 'image/jpeg'
}) {
  if (await isE2ERequest()) return completeE2EPhoto(input)
  const captured = new Date(input.capturedAt)
  if (!isReasonableCaptureDate(captured)) {
    throw new AppError(400, 'bad_request', 'Das Aufnahmedatum ist ungültig.')
  }
  const original = resolveOriginalType(input.contentType, input.filename)
  const baseKeys = photoObjectKeys(input.member.id, input.photoId, original.extension)
  const sized = input.thumbContentType ? photoThumbKeys(input.member.id, input.photoId, input.thumbContentType === 'image/webp' ? 'webp' : 'jpg') : null
  const keys = { ...baseKeys, thumb: sized?.thumb ?? baseKeys.thumb, thumbLarge: sized?.thumbLarge ?? null }
  const [originalHead, displayHead, thumbHead, largeHead] = await Promise.all([
    headR2Object(keys.original),
    headR2Object(keys.display),
    headR2Object(keys.thumb),
    keys.thumbLarge ? headR2Object(keys.thumbLarge) : Promise.resolve(null),
  ])
  if (originalHead.byteSize < 1 || originalHead.byteSize > LIMITS.originalBytes) {
    throw new AppError(400, 'bad_request', 'Die Originaldatei ist zu groß oder leer.')
  }
  if (displayHead.byteSize < 1 || displayHead.byteSize > LIMITS.displayBytes) {
    throw new AppError(400, 'bad_request', 'Die Anzeigeversion ist zu groß oder leer.')
  }
  if (thumbHead.byteSize < 1 || thumbHead.byteSize > LIMITS.thumbBytes) {
    throw new AppError(400, 'bad_request', 'Die Vorschau ist zu groß oder leer.')
  }
  if (largeHead && (largeHead.byteSize < 1 || largeHead.byteSize > LIMITS.thumbBytes)) {
    throw new AppError(400, 'bad_request', 'Die große Vorschau ist zu groß oder leer.')
  }
  if (input.blurData && !input.blurData.startsWith('data:image/')) {
    throw new AppError(400, 'bad_request', 'Die Platzhalter-Vorschau ist ungültig.')
  }

  const supabase = await createClient()
  const { error } = await supabase.from('photos').insert({
    id: keys.photoId,
    owner_id: input.member.id,
    original_key: keys.original,
    display_key: keys.display,
    thumb_key: keys.thumb,
    thumb_large_key: keys.thumbLarge,
    blur_data: input.blurData ?? null,
    filename: sanitizeFilename(input.filename),
    content_type: original.contentType,
    byte_size: originalHead.byteSize,
    width: input.width,
    height: input.height,
    captured_at: captured.toISOString(),
  })
  if (error) {
    if (error.code === '23505') throw new AppError(409, 'conflict', 'Dieses Foto ist schon gespeichert.')
    console.error('photo insert failed', { code: error.code, message: error.message })
    throw new AppError(500, 'server', 'Die Fotodaten konnten nicht gespeichert werden.')
  }
  return { id: keys.photoId }
}

export async function completeVideoUpload(input: {
  member: Member
  photoId: string
  filename: string
  contentType: string
  width: number | null
  height: number | null
  capturedAt: string
  durationMs: number
  codec: string | null
  byteSize: number
  hasThumb: boolean
}) {
  const captured = new Date(input.capturedAt)
  if (!isReasonableCaptureDate(captured)) {
    throw new AppError(400, 'bad_request', 'Das Aufnahmedatum ist ungültig.')
  }
  const video = resolveVideoType(input.contentType, input.filename)
  const keys = videoObjectKeys(input.member.id, input.photoId, video.extension)
  const originalHead = await headR2Object(keys.original)
  if (originalHead.byteSize < 1 || originalHead.byteSize > LIMITS.videoBytes || originalHead.byteSize !== input.byteSize) {
    throw new AppError(400, 'bad_request', 'Die Videodatei ist unvollständig.')
  }
  let thumbKey: string | null = null
  if (input.hasThumb) {
    const thumbHead = await headR2Object(keys.thumb)
    if (thumbHead.byteSize < 1 || thumbHead.byteSize > LIMITS.thumbBytes) {
      throw new AppError(400, 'bad_request', 'Die Vorschau ist zu groß oder leer.')
    }
    thumbKey = keys.thumb
    const largeHead = await headR2Object(keys.thumbLarge)
    if (largeHead.byteSize < 1 || largeHead.byteSize > LIMITS.thumbBytes) {
      throw new AppError(400, 'bad_request', 'Die große Vorschau ist zu groß oder leer.')
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('photos').insert({
    id: keys.photoId,
    owner_id: input.member.id,
    original_key: keys.original,
    display_key: null,
    thumb_key: thumbKey,
    thumb_large_key: input.hasThumb ? keys.thumbLarge : null,
    filename: sanitizeFilename(input.filename),
    content_type: video.contentType,
    byte_size: originalHead.byteSize,
    width: input.width,
    height: input.height,
    captured_at: captured.toISOString(),
    media_type: 'video',
    duration_ms: input.durationMs,
    codec: input.codec,
  })
  if (error) {
    if (error.code === '23505') throw new AppError(409, 'conflict', 'Dieses Video ist schon gespeichert.')
    console.error('video insert failed', { code: error.code, message: error.message })
    throw new AppError(500, 'server', 'Die Videodaten konnten nicht gespeichert werden.')
  }
  return { id: keys.photoId }
}
