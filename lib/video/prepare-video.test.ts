import { describe, expect, it } from 'vitest'
import { prepareVideoFile } from '@/lib/video/prepare-video'

function ftyp(brand: string): Uint8Array {
  const bytes = new Uint8Array(16)
  new DataView(bytes.buffer).setUint32(0, 16)
  bytes.set([0x66, 0x74, 0x79, 0x70], 4)
  bytes.set(brand.slice(0, 4).padEnd(4, ' ').split('').map((char) => char.charCodeAt(0)), 8)
  return bytes
}

describe('prepareVideoFile', () => {
  it('keeps the original and falls back when the browser cannot draw a frame', async () => {
    const bytes = ftyp('qt  ')
    const file = new File([Buffer.from(bytes)], 'urlaub.mov', { type: 'video/quicktime', lastModified: Date.parse('2024-07-02T10:00:00.000Z') })
    const prepared = await prepareVideoFile(file, async () => null)
    expect(prepared.contentType).toBe('video/quicktime')
    expect(prepared.byteSize).toBe(bytes.byteLength)
    expect(prepared.thumb).toBeNull()
    expect(prepared.capturedAt.toISOString()).toBe('2024-07-02T10:00:00.000Z')
    expect(prepared.header).toBe(Buffer.from(bytes).toString('base64'))
  })

  it('uses a decoded frame when the browser can play the file', async () => {
    const bytes = ftyp('isom')
    const file = new File([Buffer.from(bytes)], 'clip.mp4', { type: '' })
    const thumb = new Blob(['webp'], { type: 'image/webp' })
    const prepared = await prepareVideoFile(file, async () => ({ blob: thumb, width: 1280, height: 720, durationMs: 1500 }))
    expect(prepared.thumb).toBe(thumb)
    expect(prepared.width).toBe(1280)
    expect(prepared.durationMs).toBe(1500)
    expect(prepared.contentType).toBe('video/mp4')
  })
})
