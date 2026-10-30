import { AppError } from '@/lib/errors'

export type OriginalExtension = 'jpg' | 'png' | 'heic' | 'heif'
export type ScreenshotExtension = 'jpg' | 'png' | 'webp'
export type VideoExtension = 'mp4' | 'mov' | '3gp' | 'webm'

const ORIGINAL_BY_TYPE: Record<string, OriginalExtension> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/heic-sequence': 'heic',
  'image/heif-sequence': 'heif',
}

const ORIGINAL_BY_EXTENSION: Record<string, { contentType: string; extension: OriginalExtension }> = {
  jpg: { contentType: 'image/jpeg', extension: 'jpg' },
  jpeg: { contentType: 'image/jpeg', extension: 'jpg' },
  png: { contentType: 'image/png', extension: 'png' },
  heic: { contentType: 'image/heic', extension: 'heic' },
  heif: { contentType: 'image/heif', extension: 'heif' },
}

const CANONICAL_TYPE: Record<OriginalExtension, string> = {
  jpg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heif',
}

export function fileExtension(filename: string): string {
  const base = filename.split(/[/\\]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return ''
  return base.slice(dot + 1).toLowerCase()
}

export function resolveOriginalType(
  contentType: string,
  filename: string,
): { contentType: string; extension: OriginalExtension } {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const fromType = ORIGINAL_BY_TYPE[normalized]
  if (fromType) {
    return { contentType: CANONICAL_TYPE[fromType], extension: fromType }
  }
  const extension = fileExtension(filename)
  const fromName = ORIGINAL_BY_EXTENSION[extension]
  if (fromName && (normalized === '' || normalized === 'application/octet-stream')) {
    return fromName
  }
  throw new AppError(400, 'unsupported_type', 'Erlaubt sind JPEG, PNG und HEIC/HEIF.')
}

export function resolveScreenshotType(contentType: string): { contentType: string; extension: ScreenshotExtension } {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  if (normalized === 'image/png') return { contentType: 'image/png', extension: 'png' }
  if (normalized === 'image/webp') return { contentType: 'image/webp', extension: 'webp' }
  if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
    return { contentType: 'image/jpeg', extension: 'jpg' }
  }
  throw new AppError(400, 'unsupported_type', 'Screenshots dürfen JPEG, PNG oder WebP sein.')
}

export function isHeicExtension(extension: OriginalExtension): boolean {
  return extension === 'heic' || extension === 'heif'
}

const VIDEO_BY_TYPE: Record<string, VideoExtension> = {
  'video/mp4': 'mp4',
  'video/m4v': 'mp4',
  'video/quicktime': 'mov',
  'video/mov': 'mov',
  'video/3gpp': '3gp',
  'video/3gp': '3gp',
  'video/webm': 'webm',
}

const VIDEO_BY_EXTENSION: Record<string, { contentType: string; extension: VideoExtension }> = {
  mp4: { contentType: 'video/mp4', extension: 'mp4' },
  m4v: { contentType: 'video/mp4', extension: 'mp4' },
  mov: { contentType: 'video/quicktime', extension: 'mov' },
  '3gp': { contentType: 'video/3gpp', extension: '3gp' },
  webm: { contentType: 'video/webm', extension: 'webm' },
}

const VIDEO_CANONICAL: Record<VideoExtension, string> = {
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  webm: 'video/webm',
}

export function isVideoFile(file: { name: string; type: string }): boolean {
  if (file.type.toLowerCase().startsWith('video/')) return true
  const extension = fileExtension(file.name)
  return extension in VIDEO_BY_EXTENSION
}

export function resolveVideoType(
  contentType: string,
  filename: string,
): { contentType: string; extension: VideoExtension } {
  const normalized = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  const fromType = VIDEO_BY_TYPE[normalized]
  if (fromType) return { contentType: VIDEO_CANONICAL[fromType], extension: fromType }
  const extension = fileExtension(filename)
  const fromName = VIDEO_BY_EXTENSION[extension]
  if (fromName && (normalized === '' || normalized === 'application/octet-stream' || normalized === 'video/mp4')) {
    return fromName
  }
  throw new AppError(400, 'unsupported_type', 'Erlaubt sind MP4, MOV, 3GP und WebM.')
}
