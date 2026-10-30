import { AppError } from '@/lib/errors'
import type { OriginalExtension, ScreenshotExtension, VideoExtension } from '@/lib/content-types'
import type { PhotoVariant } from '@/lib/types'

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const LIMITS = {
  originalBytes: 50 * 1024 * 1024,
  displayBytes: 12 * 1024 * 1024,
  thumbBytes: 800 * 1024,
  videoBytes: 4 * 1024 * 1024 * 1024,
  screenshotBytes: 8 * 1024 * 1024,
  pageSize: 24,
  maxPageSize: 48,
  thumbBatch: 48,
} as const

export function assertUuid(value: string, label: string): string {
  if (!UUID_RE.test(value)) {
    throw new AppError(400, 'bad_request', `${label} ist ungültig.`)
  }
  return value.toLowerCase()
}

export function assertSafeObjectKey(key: string): void {
  if (
    !key ||
    key.length > 512 ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.includes('..') ||
    key.includes('\0') ||
    key.includes('//')
  ) {
    throw new AppError(400, 'bad_request', 'Ungültiger Speicherpfad.')
  }
}

export function photoObjectKeys(memberId: string, photoId: string, extension: OriginalExtension) {
  const member = assertUuid(memberId, 'Mitglied')
  const photo = assertUuid(photoId, 'Foto')
  const base = `members/${member}/photos/${photo}`
  const keys = {
    memberId: member,
    photoId: photo,
    original: `${base}/original.${extension}`,
    display: `${base}/display.jpg`,
    thumb: `${base}/thumb.jpg`,
    thumbLarge: `${base}/thumb-640.jpg`,
  }
  assertSafeObjectKey(keys.original)
  assertSafeObjectKey(keys.display)
  assertSafeObjectKey(keys.thumb)
  assertSafeObjectKey(keys.thumbLarge)
  return keys
}

export function photoThumbKeys(memberId: string, photoId: string, extension: 'jpg' | 'webp') {
  const member = assertUuid(memberId, 'Mitglied')
  const photo = assertUuid(photoId, 'Foto')
  const base = `members/${member}/photos/${photo}`
  const keys = {
    thumb: `${base}/thumb-320.${extension}`,
    thumbLarge: `${base}/thumb-640.${extension}`,
  }
  assertSafeObjectKey(keys.thumb)
  assertSafeObjectKey(keys.thumbLarge)
  return keys
}

export function videoObjectKeys(memberId: string, photoId: string, extension: VideoExtension) {
  const member = assertUuid(memberId, 'Mitglied')
  const photo = assertUuid(photoId, 'Video')
  const base = `members/${member}/photos/${photo}`
  const keys = {
    memberId: member,
    photoId: photo,
    original: `${base}/original.${extension}`,
    thumb: `${base}/thumb-320.webp`,
    thumbLarge: `${base}/thumb-640.webp`,
  }
  assertSafeObjectKey(keys.original)
  assertSafeObjectKey(keys.thumb)
  assertSafeObjectKey(keys.thumbLarge)
  return keys
}

export function keyForVariant(
  photo: { originalKey: string; displayKey: string | null; thumbKey: string | null },
  variant: PhotoVariant,
): string {
  const key =
    variant === 'original' ? photo.originalKey : variant === 'display' ? photo.displayKey : photo.thumbKey
  if (!key) throw new AppError(404, 'not_found', 'Diese Version gibt es nicht.')
  assertSafeObjectKey(key)
  return key
}

export function contentDispositionAttachment(filename: string): string {
  const cleaned = sanitizeFilename(filename).replace(/["\\]/g, '') || 'video'
  return `attachment; filename="${cleaned}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`
}

export function feedbackScreenshotKey(
  memberId: string,
  feedbackId: string,
  extension: ScreenshotExtension,
): string {
  const key = `feedback/${assertUuid(memberId, 'Mitglied')}/${assertUuid(feedbackId, 'Rückmeldung')}/screenshot.${extension}`
  assertSafeObjectKey(key)
  return key
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'foto'
  const cleaned = base.replace(/[\u0000-\u001f]/g, '').trim()
  return cleaned.slice(0, 180) || 'foto'
}
