import { AppError } from '@/lib/errors'

export type OriginalExtension = 'jpg' | 'png' | 'heic' | 'heif'
export type ScreenshotExtension = 'jpg' | 'png' | 'webp'

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
