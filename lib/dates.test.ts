import { describe, expect, it } from 'vitest'
import {
  comparePhotosNewestFirst,
  decodeCursor,
  encodeCursor,
  formatDayKey,
  groupPhotosByMonth,
  parseExifDateTime,
  resolveCapturedAt,
  sortPhotosNewestFirst,
} from '@/lib/dates'

const upload = new Date('2024-06-01T12:00:00.000Z')

describe('resolveCapturedAt', () => {
  it('prefers DateTimeOriginal over CreateDate and the upload date', () => {
    const captured = resolveCapturedAt({
      dateTimeOriginal: '2020:01:02 03:04:05',
      createDate: '2024:05:06 07:08:09',
      uploadDate: upload,
    })
    expect(captured.toISOString()).toBe('2020-01-02T02:04:05.000Z')
  })

  it('uses CreateDate when DateTimeOriginal is missing', () => {
    const captured = resolveCapturedAt({
      createDate: '2024:07:01 15:30:45',
      uploadDate: upload,
    })
    expect(captured.toISOString()).toBe('2024-07-01T13:30:45.000Z')
  })

  it('falls back to the upload date when no EXIF date exists', () => {
    const captured = resolveCapturedAt({
      dateTimeOriginal: null,
      createDate: 'not-a-date',
      uploadDate: upload,
    })
    expect(captured.toISOString()).toBe(upload.toISOString())
  })

  it('ignores impossible calendar dates and ancient years', () => {
    const captured = resolveCapturedAt({
      dateTimeOriginal: '2024:13:01 00:00:00',
      createDate: '0000:00:00 00:00:00',
      uploadDate: upload,
    })
    expect(captured.toISOString()).toBe(upload.toISOString())
  })

  it('applies OffsetTimeOriginal instead of the Berlin default', () => {
    const captured = resolveCapturedAt({
      dateTimeOriginal: '2024:07:01 15:30:45',
      offsetTimeOriginal: '-05:00',
      uploadDate: upload,
    })
    expect(captured.toISOString()).toBe('2024-07-01T20:30:45.000Z')
  })

  it('treats a naive winter timestamp as Europe/Berlin', () => {
    const parsed = parseExifDateTime('2024:01:15 12:00:00')
    expect(parsed?.toISOString()).toBe('2024-01-15T11:00:00.000Z')
  })
})

describe('sortPhotosNewestFirst', () => {
  it('orders by capture date, newest first, not by upload or filename', () => {
    const photos = [
      { id: 'a', capturedAt: '2020-01-01T00:00:00.000Z', uploadedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'b', capturedAt: '2024-08-01T00:00:00.000Z', uploadedAt: '2019-01-01T00:00:00.000Z' },
      { id: 'c', capturedAt: '2022-03-03T00:00:00.000Z', uploadedAt: '2023-01-01T00:00:00.000Z' },
    ]
    expect(sortPhotosNewestFirst(photos).map((photo) => photo.id)).toEqual(['b', 'c', 'a'])
  })

  it('breaks identical capture timestamps by id descending', () => {
    const photos = [
      { id: 'a', capturedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'c', capturedAt: '2024-01-01T00:00:00.000Z' },
      { id: 'b', capturedAt: '2024-01-01T00:00:00.000Z' },
    ]
    expect(sortPhotosNewestFirst(photos).map((photo) => photo.id)).toEqual(['c', 'b', 'a'])
    expect(comparePhotosNewestFirst(photos[0], photos[2])).toBeGreaterThan(0)
  })

  it('puts an EXIF capture date ahead of a later upload fallback', () => {
    const withExif = resolveCapturedAt({
      dateTimeOriginal: '2024:12:24 18:00:00',
      uploadDate: new Date('2024-01-01T00:00:00.000Z'),
    })
    const uploadOnly = resolveCapturedAt({
      uploadDate: new Date('2024-06-01T00:00:00.000Z'),
    })
    const sorted = sortPhotosNewestFirst([
      { id: 'upload-only', capturedAt: uploadOnly },
      { id: 'exif', capturedAt: withExif },
    ])
    expect(sorted.map((photo) => photo.id)).toEqual(['exif', 'upload-only'])
  })
})

describe('groupPhotosByMonth', () => {
  it('groups by Berlin calendar day and keeps the newest day first', () => {
    const groups = groupPhotosByMonth([
      { id: 'late-utc', capturedAt: '2024-07-01T22:30:00.000Z' },
      { id: 'same-evening', capturedAt: '2024-07-01T21:30:00.000Z' },
      { id: 'next-morning', capturedAt: '2024-07-01T23:30:00.000Z' },
    ])
    expect(formatDayKey(new Date('2024-07-01T22:30:00.000Z'))).toBe('2024-07-02')
    expect(formatDayKey(new Date('2024-07-01T21:30:00.000Z'))).toBe('2024-07-01')
    expect(groups.map((month) => month.label)).toEqual(['Juli 2024'])
    expect(groups[0]?.days.map((day) => day.dayKey)).toEqual(['2024-07-02', '2024-07-01'])
    expect(groups[0]?.days[0]?.photos.map((photo) => photo.id)).toEqual(['next-morning', 'late-utc'])
    expect(groups[0]?.days[1]?.photos.map((photo) => photo.id)).toEqual(['same-evening'])
  })
})

describe('cursor', () => {
  it('round-trips a capture instant and id', () => {
    const encoded = encodeCursor('2024-07-01T13:30:45.000Z', '11111111-1111-4111-8111-111111111111')
    expect(decodeCursor(encoded)).toEqual({
      at: '2024-07-01T13:30:45.000Z',
      id: '11111111-1111-4111-8111-111111111111',
    })
    expect(decodeCursor('nope')).toBeNull()
  })
})
