import { describe, expect, it, vi } from 'vitest'
import { VIDEO_MAX_BYTES, VIDEO_PART_BYTES, assertCompleteParts, assertUploadId, normalizeEtag, planVideoParts, uploadVideoParts } from '@/lib/video/multipart'

describe('multipart planning', () => {
  it('splits a video into 16 MB parts and rejects anything above 4 GB', () => {
    expect(planVideoParts(1)).toEqual({ partSize: VIDEO_PART_BYTES, partCount: 1 })
    expect(planVideoParts(VIDEO_PART_BYTES + 1).partCount).toBe(2)
    expect(planVideoParts(VIDEO_MAX_BYTES).partCount).toBe(256)
    expect(() => planVideoParts(0)).toThrow(/4 GB/)
    expect(() => planVideoParts(VIDEO_MAX_BYTES + 1)).toThrow(/4 GB/)
    expect(normalizeEtag('abc')).toBe('"abc"')
    expect(normalizeEtag('"abc"')).toBe('"abc"')
    expect(assertUploadId('upload-12345678')).toBe('upload-12345678')
    expect(() => assertUploadId('../secret')).toThrow(/Upload-ID/)
    expect(assertCompleteParts([{ partNumber: 2, etag: 'b' }, { partNumber: 1, etag: '"a"' }], 2)).toEqual([
      { partNumber: 1, etag: '"a"' },
      { partNumber: 2, etag: '"b"' },
    ])
    expect(() => assertCompleteParts([{ partNumber: 2, etag: 'b' }], 2)).toThrow(/fehlen/)
    expect(() => assertCompleteParts([{ partNumber: 1, etag: 'a' }, { partNumber: 3, etag: 'c' }], 2)).toThrow(/unvollständig/)
    expect(() => normalizeEtag('')).toThrow(/Prüfsumme/)
    expect(() => planVideoParts(10, 1024)).toThrow(/Teilgröße/)
  })

  it('retries a part and reports progress without a real network', async () => {
    const puts: number[] = []
    let failed = false
    const parts = await uploadVideoParts({
      byteSize: 10,
      partSize: 8 * 1024 * 1024,
      concurrency: 2,
      slice: (start, end) => new Blob([new Uint8Array(end - start)]),
      getUrl: async (partNumber) => `https://signed.example/${partNumber}`,
      put: async (_url, body) => {
        puts.push(body.size)
        if (!failed) {
          failed = true
          throw new Error('reset')
        }
        return 'etag'
      },
      onProgress: vi.fn(),
    })
    expect(parts.map((part) => part.partNumber)).toEqual([1])
    expect(parts[0]?.etag).toBe('"etag"')
    expect(puts.length).toBeGreaterThan(1)
  })
})
