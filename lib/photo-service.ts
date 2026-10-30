import 'server-only'

import { resolveOriginalType } from '@/lib/content-types'
import { isReasonableCaptureDate } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { LIMITS, photoObjectKeys, sanitizeFilename } from '@/lib/keys'
import { readPresignExpiry } from '@/lib/presign'
import { completeE2EPhoto, listE2EPhotos } from '@/lib/e2e-store'
import { isE2ERequest } from '@/lib/e2e-guard'
import { createR2Signer, headR2Object } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import type { Member, PhotoRecord, PhotoScope } from '@/lib/types'

type PhotoRow = {
  id: string
  owner_id: string
  original_key: string
  display_key: string
  thumb_key: string
  filename: string
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  captured_at: string
  created_at: string
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
  }
}

const photoColumns = 'id, owner_id, original_key, display_key, thumb_key, filename, content_type, byte_size, width, height, captured_at, created_at, members(display_name, email)'

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

export async function listPhotoPage(scope: PhotoScope, cursor: { at: string; id: string } | null) {
  if (await isE2ERequest()) return listE2EPhotos(scope, cursor)
  const supabase = await createClient()
  const limit = LIMITS.pageSize
  const { data, error } = await supabase.rpc('list_photos', {
    p_scope: scope,
    p_cursor_at: cursor?.at ?? null,
    p_cursor_id: cursor?.id ?? null,
    p_limit: limit + 1,
  })
  if (error) throw new AppError(500, 'server', 'Die Fotoliste konnte nicht geladen werden.')
  const rows = ((data ?? []) as PhotoRow[]).map(mapPhoto)
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const expiresIn = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
  const signer = page.length ? createR2Signer() : null
  const photos = await Promise.all(
    page.map(async (photo) => {
      const signed = await signer!.signGet({ key: photo.thumbKey, expiresIn })
      return { ...publicPhoto(photo), thumbUrl: signed }
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
}) {
  if (await isE2ERequest()) return completeE2EPhoto(input)
  const captured = new Date(input.capturedAt)
  if (!isReasonableCaptureDate(captured)) {
    throw new AppError(400, 'bad_request', 'Das Aufnahmedatum ist ungültig.')
  }
  const original = resolveOriginalType(input.contentType, input.filename)
  const keys = photoObjectKeys(input.member.id, input.photoId, original.extension)
  const [originalHead, displayHead, thumbHead] = await Promise.all([
    headR2Object(keys.original),
    headR2Object(keys.display),
    headR2Object(keys.thumb),
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

  const supabase = await createClient()
  const { error } = await supabase.from('photos').insert({
    id: keys.photoId,
    owner_id: input.member.id,
    original_key: keys.original,
    display_key: keys.display,
    thumb_key: keys.thumb,
    filename: sanitizeFilename(input.filename),
    content_type: original.contentType,
    byte_size: originalHead.byteSize,
    width: input.width,
    height: input.height,
    captured_at: captured.toISOString(),
  })
  if (error) {
    if (error.code === '23505') throw new AppError(409, 'conflict', 'Dieses Foto ist schon gespeichert.')
    throw new AppError(500, 'server', 'Die Fotodaten konnten nicht gespeichert werden.')
  }
  return { id: keys.photoId }
}
