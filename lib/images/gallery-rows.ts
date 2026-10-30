import { groupPhotosByMonth } from '@/lib/dates'
import { chunkPhotos } from '@/lib/images/thumbs'
import type { GalleryPhoto, PhotoScope } from '@/lib/types'

export type GalleryRow =
  | { kind: 'month'; key: string; label: string }
  | { kind: 'day'; key: string; label: string }
  | { kind: 'tiles'; key: string; photos: GalleryPhoto[] }

export function buildGalleryRows(photos: readonly GalleryPhoto[], scope: PhotoScope, columns: number): GalleryRow[] {
  if (scope === 'mine') {
    return chunkPhotos(photos, columns).map((row, index) => ({
      kind: 'tiles' as const,
      key: row.map((photo) => photo.id).join('-') || `empty-${index}`,
      photos: row,
    }))
  }
  const rows: GalleryRow[] = []
  for (const month of groupPhotosByMonth(photos)) {
    rows.push({ kind: 'month', key: month.monthKey, label: month.label })
    for (const day of month.days) {
      rows.push({ kind: 'day', key: day.dayKey, label: day.label })
      chunkPhotos(day.photos, columns).forEach((row, index) => {
        rows.push({ kind: 'tiles', key: `${day.dayKey}-${index}`, photos: row })
      })
    }
  }
  return rows
}

export function estimateRowHeight(row: GalleryRow, tilePx: number): number {
  if (row.kind === 'month') return 48
  if (row.kind === 'day') return 28
  return tilePx
}
