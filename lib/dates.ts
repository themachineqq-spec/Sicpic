export const GROUP_TIME_ZONE = 'Europe/Berlin'

const MIN_CAPTURE_MS = Date.UTC(1970, 0, 1)
const MAX_CAPTURE_MS = Date.UTC(2100, 0, 1)

const EXIF_NAIVE =
  /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
const ISO_NAIVE =
  /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
const OFFSET = /^([+-])(\d{2}):(\d{2})$/

export type DateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export type SortablePhoto = {
  id: string
  capturedAt: Date | string
}

export type DayGroup<T> = {
  dayKey: string
  label: string
  photos: T[]
}

export type MonthGroup<T> = {
  monthKey: string
  label: string
  days: DayGroup<T>[]
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0')
}

function isValidParts(parts: DateParts): boolean {
  if (parts.month < 1 || parts.month > 12) return false
  if (parts.day < 1 || parts.day > 31) return false
  if (parts.hour > 23 || parts.minute > 59 || parts.second > 59) return false
  const probe = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  return probe.getUTCMonth() === parts.month - 1 && probe.getUTCDate() === parts.day
}

export function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant)
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value)
  const zonedAsUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    read('hour') === 24 ? 0 : read('hour'),
    read('minute'),
    read('second'),
  )
  return zonedAsUtc - instant.getTime()
}

export function zonedPartsToUtc(parts: DateParts, timeZone: string): Date | null {
  if (!isValidParts(parts)) return null
  const wallClock = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  )
  let utc = wallClock - timeZoneOffsetMs(new Date(wallClock), timeZone)
  utc = wallClock - timeZoneOffsetMs(new Date(utc), timeZone)
  const result = new Date(utc)
  return Number.isNaN(result.getTime()) ? null : result
}

export function parseExifDateTime(
  value: unknown,
  offset?: string | null,
  timeZone = GROUP_TIME_ZONE,
): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : new Date(value.getTime())
  }
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  if (/[zZ]$/.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  const match = EXIF_NAIVE.exec(trimmed) ?? ISO_NAIVE.exec(trimmed)
  if (!match) return null
  const parts: DateParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6]),
  }
  if (!isValidParts(parts)) return null

  const zoneOffset = offset?.trim()
  if (zoneOffset && OFFSET.test(zoneOffset)) {
    const iso = `${pad(parts.year, 4)}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}${zoneOffset}`
    const parsed = new Date(iso)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return zonedPartsToUtc(parts, timeZone)
}

export function isReasonableCaptureDate(value: Date): boolean {
  const time = value.getTime()
  return !Number.isNaN(time) && time >= MIN_CAPTURE_MS && time < MAX_CAPTURE_MS
}

export function resolveCapturedAt(input: {
  dateTimeOriginal?: unknown
  createDate?: unknown
  offsetTimeOriginal?: string | null
  offsetTime?: string | null
  uploadDate: Date
  timeZone?: string
}): Date {
  const timeZone = input.timeZone ?? GROUP_TIME_ZONE
  const originalOffset = input.offsetTimeOriginal ?? input.offsetTime
  const candidates = [
    parseExifDateTime(input.dateTimeOriginal, originalOffset, timeZone),
    parseExifDateTime(input.createDate, input.offsetTime ?? input.offsetTimeOriginal, timeZone),
  ]
  for (const candidate of candidates) {
    if (candidate && isReasonableCaptureDate(candidate)) return candidate
  }
  if (isReasonableCaptureDate(input.uploadDate)) return input.uploadDate
  return new Date()
}

function toMillis(value: Date | string): number {
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(time) ? 0 : time
}

export function comparePhotosNewestFirst(a: SortablePhoto, b: SortablePhoto): number {
  const delta = toMillis(b.capturedAt) - toMillis(a.capturedAt)
  if (delta !== 0) return delta
  return b.id.localeCompare(a.id)
}

export function sortPhotosNewestFirst<T extends SortablePhoto>(photos: readonly T[]): T[] {
  return [...photos].sort(comparePhotosNewestFirst)
}

function part(
  date: Date,
  timeZone: string,
  type: Intl.DateTimeFormatPartTypes,
  options: Intl.DateTimeFormatOptions,
): string {
  return (
    new Intl.DateTimeFormat('en-CA', { ...options, timeZone }).formatToParts(date).find((item) => item.type === type)
      ?.value ?? ''
  )
}

export function formatDayKey(date: Date, timeZone = GROUP_TIME_ZONE): string {
  const year = part(date, timeZone, 'year', { year: 'numeric' })
  const month = part(date, timeZone, 'month', { month: '2-digit' })
  const day = part(date, timeZone, 'day', { day: '2-digit' })
  return `${year}-${month}-${day}`
}

export function formatDayLabel(date: Date, timeZone = GROUP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatMonthLabel(date: Date, timeZone = GROUP_TIME_ZONE): string {
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatPhotoTime(date: Date | string, timeZone = GROUP_TIME_ZONE): string {
  const value = date instanceof Date ? date : new Date(date)
  return new Intl.DateTimeFormat('de-DE', {
    timeZone,
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(value)
}

export function groupPhotosByMonth<T extends SortablePhoto>(
  photos: readonly T[],
  timeZone = GROUP_TIME_ZONE,
): MonthGroup<T>[] {
  const sorted = sortPhotosNewestFirst(photos)
  const months: MonthGroup<T>[] = []
  for (const photo of sorted) {
    const date = new Date(photo.capturedAt)
    const dayKey = formatDayKey(date, timeZone)
    const monthKey = dayKey.slice(0, 7)
    let month = months.find((item) => item.monthKey === monthKey)
    if (!month) {
      month = { monthKey, label: formatMonthLabel(date, timeZone), days: [] }
      months.push(month)
    }
    let day = month.days.find((item) => item.dayKey === dayKey)
    if (!day) {
      day = { dayKey, label: formatDayLabel(date, timeZone), photos: [] }
      month.days.push(day)
    }
    day.photos.push(photo)
  }
  return months
}

export function encodeCursor(capturedAt: string, id: string): string {
  return `${new Date(capturedAt).toISOString()}|${id}`
}

export function decodeCursor(value: string | null | undefined): { at: string; id: string } | null {
  if (!value) return null
  const separator = value.lastIndexOf('|')
  if (separator <= 0) return null
  const at = value.slice(0, separator)
  const id = value.slice(separator + 1)
  const time = new Date(at)
  if (Number.isNaN(time.getTime()) || !id) return null
  return { at: time.toISOString(), id }
}
