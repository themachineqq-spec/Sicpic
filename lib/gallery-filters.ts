import { GROUP_TIME_ZONE, formatDayKey, zonedPartsToUtc, type DateParts } from '@/lib/dates'
import type { GalleryPhoto, MediaFilter } from '@/lib/types'

export type GalleryFilters = {
  media: MediaFilter
  ownerId: string | null
  from: string | null
  to: string | null
}

export const EMPTY_FILTERS: GalleryFilters = { media: 'all', ownerId: null, from: null, to: null }

const DAY = /^\d{4}-\d{2}-\d{2}$/
const OWNER = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseGalleryFilters(params: { get(name: string): string | null }): GalleryFilters {
  const type = params.get('type')
  const media: MediaFilter = type === 'photo' || type === 'video' ? type : 'all'
  const owner = params.get('person')
  const from = params.get('from')
  const to = params.get('to')
  return {
    media,
    ownerId: owner && OWNER.test(owner) ? owner : null,
    from: from && DAY.test(from) ? from : null,
    to: to && DAY.test(to) ? to : null,
  }
}

export function filtersToQuery(filters: GalleryFilters): string {
  const params = new URLSearchParams()
  if (filters.media !== 'all') params.set('type', filters.media)
  if (filters.ownerId) params.set('person', filters.ownerId)
  if (filters.from) params.set('from', filters.from)
  if (filters.to) params.set('to', filters.to)
  return params.toString()
}

export function parseApiListFilter(params: { get(name: string): string | null }): { ownerId: string | null; from: string | null; to: string | null } | null {
  const owner = params.get('owner')
  if (owner && !OWNER.test(owner)) return null
  const from = params.get('from')
  const to = params.get('to')
  if (from && Number.isNaN(Date.parse(from))) return null
  if (to && Number.isNaN(Date.parse(to))) return null
  return { ownerId: owner || null, from, to }
}

export function filtersActive(filters: GalleryFilters): boolean {
  return filters.media !== 'all' || Boolean(filters.ownerId || filters.from || filters.to)
}

export function galleryCacheKey(scope: string, filters: GalleryFilters = EMPTY_FILTERS): string {
  return `gallery:${scope}:${filters.media}:${filters.ownerId ?? ''}:${filters.from ?? ''}:${filters.to ?? ''}`
}

function dayStart(day: string): Date | null {
  if (!DAY.test(day)) return null
  const [year, month, date] = day.split('-').map(Number)
  const parts: DateParts = { year, month, day: date, hour: 0, minute: 0, second: 0 }
  return zonedPartsToUtc(parts, GROUP_TIME_ZONE)
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  const utc = new Date(Date.UTC(year, month - 1, date))
  utc.setUTCDate(utc.getUTCDate() + 1)
  return utc.toISOString().slice(0, 10)
}

export function filterRangeInstants(filters: GalleryFilters): { from: string | null; to: string | null } {
  const from = filters.from ? dayStart(filters.from) : null
  const to = filters.to ? dayStart(nextDay(filters.to)) : null
  return { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null }
}

export type PhotoIndex = {
  all: GalleryPhoto[]
  photo: GalleryPhoto[]
  video: GalleryPhoto[]
  byOwner: Map<string, GalleryPhoto[]>
  dayKey: Map<string, string>
  owners: { id: string; name: string }[]
}

export function indexPhotos(photos: readonly GalleryPhoto[]): PhotoIndex {
  const photo: GalleryPhoto[] = []
  const video: GalleryPhoto[] = []
  const byOwner = new Map<string, GalleryPhoto[]>()
  const dayKey = new Map<string, string>()
  const ownerNames = new Map<string, string>()
  for (const item of photos) {
    if (item.mediaType === 'video') video.push(item)
    else photo.push(item)
    const owned = byOwner.get(item.ownerId)
    if (owned) owned.push(item)
    else byOwner.set(item.ownerId, [item])
    dayKey.set(item.id, formatDayKey(new Date(item.capturedAt)))
    if (!ownerNames.has(item.ownerId)) ownerNames.set(item.ownerId, item.uploaderName)
  }
  const owners = [...ownerNames.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'))
  return { all: photos as GalleryPhoto[], photo, video, byOwner, dayKey, owners }
}

export function selectPhotos(index: PhotoIndex, filters: GalleryFilters): GalleryPhoto[] {
  let rows = filters.media === 'video' ? index.video : filters.media === 'photo' ? index.photo : index.all
  if (filters.ownerId) {
    const owned = index.byOwner.get(filters.ownerId) ?? []
    if (filters.media === 'all') rows = owned
    else {
      const ids = new Set(owned.map((item) => item.id))
      rows = rows.filter((item) => ids.has(item.id))
    }
  }
  if (!filters.from && !filters.to) return rows
  return rows.filter((item) => {
    const day = index.dayKey.get(item.id) ?? ''
    if (filters.from && day < filters.from) return false
    if (filters.to && day > filters.to) return false
    return true
  })
}
