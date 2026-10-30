import { describe, expect, it } from 'vitest'
import { mergeVideoMetadata, parseVideoMetadata, resolveVideoCapturedAt } from '@/lib/video/metadata'
import { formatDuration } from '@/lib/video/time'

function box(type: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length)
  new DataView(out.buffer).setUint32(0, out.length)
  out.set(type.split('').map((char) => char.charCodeAt(0)), 4)
  out.set(payload, 8)
  return out
}

describe('video metadata', () => {
  it('reads mvhd time, duration, size and a codec hint', () => {
    const creation = Math.floor((Date.parse('2024-07-01T12:00:00.000Z') - Date.UTC(1904, 0, 1)) / 1000)
    const mvhd = new Uint8Array(24)
    const view = new DataView(mvhd.buffer)
    view.setUint32(4, creation)
    view.setUint32(12, 1000)
    view.setUint32(16, 2500)
    const tkhd = new Uint8Array(84)
    new DataView(tkhd.buffer).setUint32(76, 1920 * 65536)
    new DataView(tkhd.buffer).setUint32(80, 1080 * 65536)
    const moov = box('moov', concat(box('mvhd', mvhd), box('tkhd', tkhd), box('stsd', new TextEncoder().encode('avc1'))))
    const parsed = parseVideoMetadata(concat(new Uint8Array(32), moov))
    expect(parsed.mvhdDate?.toISOString()).toBe('2024-07-01T12:00:00.000Z')
    expect(parsed.durationMs).toBe(2500)
    expect(parsed.width).toBe(1920)
    expect(parsed.height).toBe(1080)
    expect(parsed.codec).toBe('h264')
    expect(formatDuration(parsed.durationMs)).toBe('0:03')
    expect(formatDuration(3_723_000)).toBe('1:02:03')
    expect(formatDuration(null)).toBe('')
  })

  it('prefers a timezone-aware QuickTime creation date over mvhd and lastModified', () => {
    const payload = new TextEncoder().encode(`com.apple.quicktime.creationdate${'\0'.repeat(4)}data${'\0'}2024-07-01T15:30:45+02:00`)
    const parsed = parseVideoMetadata(box('moov', payload))
    expect(parsed.appleDate?.toISOString()).toBe('2024-07-01T13:30:45.000Z')
    const captured = resolveVideoCapturedAt({
      appleDate: parsed.appleDate,
      mvhdDate: new Date('2020-01-01T00:00:00.000Z'),
      lastModified: Date.parse('2019-01-01T00:00:00.000Z'),
      uploadDate: new Date('2024-08-01T00:00:00.000Z'),
    })
    expect(captured.toISOString()).toBe('2024-07-01T13:30:45.000Z')
    const fallback = resolveVideoCapturedAt({
      appleDate: null,
      mvhdDate: null,
      lastModified: Date.parse('2024-06-01T12:00:00.000Z'),
      uploadDate: new Date('2024-08-01T00:00:00.000Z'),
    })
    expect(fallback.toISOString()).toBe('2024-06-01T12:00:00.000Z')
    const upload = resolveVideoCapturedAt({
      appleDate: null,
      mvhdDate: null,
      lastModified: Date.parse('1800-01-01T00:00:00.000Z'),
      uploadDate: new Date('2024-08-01T00:00:00.000Z'),
    })
    expect(upload.toISOString()).toBe('2024-08-01T00:00:00.000Z')
    expect(mergeVideoMetadata([parsed, { appleDate: null, mvhdDate: null, durationMs: 9, width: null, height: null, codec: null }]).durationMs).toBe(9)
    const naive = new TextEncoder().encode('com.apple.quicktime.creationdate 2024-07-01T15:30:45')
    expect(parseVideoMetadata(box('moov', naive)).appleDate?.toISOString()).toBe('2024-07-01T13:30:45.000Z')
    const broken = new TextEncoder().encode('com.apple.quicktime.creationdate 2024-13-01T00:00:00')
    expect(parseVideoMetadata(box('moov', broken)).appleDate).toBeNull()
    const mvhd64 = new Uint8Array(40)
    const long = new DataView(mvhd64.buffer)
    long.setUint8(0, 1)
    const seconds = Math.floor((Date.parse('2024-07-01T12:00:00.000Z') - Date.UTC(1904, 0, 1)) / 1000)
    long.setUint32(8, seconds)
    long.setUint32(20, 600)
    long.setUint32(28, 1200)
    const parsed64 = parseVideoMetadata(box('moov', box('mvhd', mvhd64)))
    expect(parsed64.durationMs).toBe(2000)
    expect(parsed64.mvhdDate?.toISOString()).toBe('2024-07-01T12:00:00.000Z')
  })
})

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}
