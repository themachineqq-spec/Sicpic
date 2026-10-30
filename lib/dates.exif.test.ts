import exifr from 'exifr'
import { describe, expect, it } from 'vitest'
import { resolveCapturedAt, sortPhotosNewestFirst } from '@/lib/dates'
import { buildExifJpeg } from '@/lib/testing/exif-jpeg'

describe('EXIF capture dates', () => {
  it('reads DateTimeOriginal from a JPEG and sorts it ahead of an upload-only photo', async () => {
    const jpeg = buildExifJpeg([
      { tag: 0x9003, value: '2020:01:02 03:04:05' },
      { tag: 0x9004, value: '2024:05:06 07:08:09' },
    ])
    const raw = await exifr.parse(jpeg, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false,
    })

    expect(raw.DateTimeOriginal).toBe('2020:01:02 03:04:05')
    const captured = resolveCapturedAt({
      dateTimeOriginal: raw.DateTimeOriginal,
      createDate: raw.CreateDate,
      offsetTimeOriginal: raw.OffsetTimeOriginal,
      uploadDate: new Date('2024-06-01T12:00:00.000Z'),
    })
    const uploadOnly = resolveCapturedAt({
      uploadDate: new Date('2021-04-04T10:00:00.000Z'),
    })

    expect(captured.toISOString()).toBe('2020-01-02T02:04:05.000Z')
    expect(sortPhotosNewestFirst([
      { id: 'exif', capturedAt: captured },
      { id: 'plain', capturedAt: uploadOnly },
    ]).map((photo) => photo.id)).toEqual(['plain', 'exif'])
  })

  it('honors OffsetTimeOriginal stored beside DateTimeOriginal', async () => {
    const jpeg = buildExifJpeg([
      { tag: 0x9003, value: '2024:07:01 15:30:45' },
      { tag: 0x9011, value: '+02:00' },
    ])
    const raw = await exifr.parse(jpeg, {
      pick: ['DateTimeOriginal', 'OffsetTimeOriginal'],
      reviveValues: false,
    })
    const captured = resolveCapturedAt({
      dateTimeOriginal: raw.DateTimeOriginal,
      offsetTimeOriginal: raw.OffsetTimeOriginal,
      uploadDate: new Date('2020-01-01T00:00:00.000Z'),
    })
    expect(captured.toISOString()).toBe('2024-07-01T13:30:45.000Z')
  })
})
