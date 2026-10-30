import { describe, expect, it } from 'vitest'
import { buildGalleryRows } from '@/lib/images/gallery-rows'
import { columnsForWidth, monthJumpCursor, stableSigningDate, stableThumbExpiry } from '@/lib/images/thumbs'
import type { GalleryPhoto } from '@/lib/types'

const photo = (id: string, capturedAt: string): GalleryPhoto => ({
  id,
  ownerId: '11111111-1111-4111-8111-111111111111',
  filename: `${id}.jpg`,
  contentType: 'image/jpeg',
  byteSize: 10,
  width: 10,
  height: 10,
  capturedAt,
  createdAt: capturedAt,
  uploaderName: 'Ada',
  thumbUrl: '/t.jpg',
})

describe('thumbnail signing window', () => {
  it('repeats the signing date inside one bucket and moves it in the next', () => {
    const windowMs = 300_000
    const start = stableSigningDate(1_700_000_000_000)
    expect(stableSigningDate(start.getTime() + windowMs - 1).getTime()).toBe(start.getTime())
    expect(stableSigningDate(start.getTime() + windowMs).getTime()).toBe(start.getTime() + windowMs)
    expect(stableThumbExpiry(300)).toBe(600)
    expect(stableThumbExpiry(60)).toBe(120)
    expect(stableThumbExpiry(1000)).toBe(600)
    expect(columnsForWidth(390)).toBe(3)
    expect(columnsForWidth(800)).toBe(4)
  })

  it('jumps to the Berlin start of the following month', () => {
    const cursor = monthJumpCursor('2024-07')
    expect(cursor.startsWith('2024-07-31T22:00:00.000Z')).toBe(true)
    expect(cursor.endsWith('|ffffffff-ffff-4fff-8fff-ffffffffffff')).toBe(true)
    expect(monthJumpCursor('2024-12')).toContain('2024-12-31T23:00:00.000Z')
    expect(() => monthJumpCursor('Juli')).toThrow(/Monat/)
  })
})

describe('gallery rows', () => {
  it('keeps day headers and limits each tile row to the column count', () => {
    const rows = buildGalleryRows(
      [photo('44444444-4444-4444-8444-444444444441', '2024-07-02T12:00:00.000Z'), photo('44444444-4444-4444-8444-444444444442', '2024-07-02T11:00:00.000Z'), photo('44444444-4444-4444-8444-444444444443', '2024-06-01T11:00:00.000Z')],
      'group',
      2,
    )
    expect(rows.filter((row) => row.kind === 'month').map((row) => row.label)).toEqual(['Juli 2024', 'Juni 2024'])
    const tiles = rows.filter((row) => row.kind === 'tiles')
    expect(tiles[0]?.photos).toHaveLength(2)
    expect(tiles[1]?.photos).toHaveLength(1)
    expect(buildGalleryRows([photo('44444444-4444-4444-8444-444444444441', '2024-07-02T12:00:00.000Z')], 'mine', 3)).toHaveLength(1)
  })
})