export const THUMB_SMALL_EDGE = 320
export const THUMB_LARGE_EDGE = 640
export const THUMB_BLUR_EDGE = 16
export const THUMB_CACHE_CONTROL = 'private, max-age=31536000, immutable'
export const THUMB_URL_WINDOW_SECONDS = 300

export function stableSigningDate(now = Date.now(), windowSeconds = THUMB_URL_WINDOW_SECONDS): Date {
  const windowMs = windowSeconds * 1000
  return new Date(Math.floor(now / windowMs) * windowMs)
}

export function stableThumbExpiry(configuredSeconds: number, windowSeconds = THUMB_URL_WINDOW_SECONDS): number {
  const window = Math.min(Math.max(configuredSeconds, 60), windowSeconds)
  return Math.min(600, window * 2)
}

export function monthJumpCursor(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey)
  if (!match) throw new Error('Monat fehlt.')
  const year = Number(match[1])
  const month = Number(match[2])
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  const utcGuess = Date.UTC(nextYear, nextMonth - 1, 1)
  const offset = berlinOffsetMs(new Date(utcGuess))
  return `${new Date(utcGuess - offset).toISOString()}|ffffffff-ffff-4fff-8fff-ffffffffffff`
}

function berlinOffsetMs(instant: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Berlin',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value)
  const asUtc = Date.UTC(read('year'), read('month') - 1, read('day'), read('hour') === 24 ? 0 : read('hour'), read('minute'), read('second'))
  return asUtc - instant.getTime()
}

export type GalleryRow =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'tiles'; key: string; photos: { id: string }[] }

export function columnsForWidth(width: number): number {
  return width >= 640 ? 4 : 3
}

export function chunkPhotos<T>(photos: readonly T[], columns: number): T[][] {
  const size = Math.max(1, columns)
  const rows: T[][] = []
  for (let index = 0; index < photos.length; index += size) rows.push(photos.slice(index, index + size))
  return rows
}
