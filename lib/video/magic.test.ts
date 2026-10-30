import { describe, expect, it } from 'vitest'
import { assertVideoHeader, decodeVideoHeader, sniffContainer } from '@/lib/video/magic'

function ftyp(brand: string): Uint8Array {
  const bytes = new Uint8Array(16)
  const view = new DataView(bytes.buffer)
  view.setUint32(0, 16)
  bytes.set([0x66, 0x74, 0x79, 0x70], 4)
  bytes.set(brand.slice(0, 4).padEnd(4, ' ').split('').map((char) => char.charCodeAt(0)), 8)
  return bytes
}

describe('video magic bytes', () => {
  it('recognizes mp4, mov, 3gp and webm', () => {
    expect(sniffContainer(ftyp('isom'))).toBe('mp4')
    expect(sniffContainer(ftyp('qt  '))).toBe('mov')
    expect(sniffContainer(ftyp('3gp5'))).toBe('3gp')
    const webm = new Uint8Array(12)
    webm.set([0x1a, 0x45, 0xdf, 0xa3])
    expect(sniffContainer(webm)).toBe('webm')
    expect(sniffContainer(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull()
  })

  it('accepts quicktime brands in an mp4 name and rejects a mismatch', () => {
    expect(assertVideoHeader(ftyp('qt  '), 'mov')).toBe('mov')
    expect(assertVideoHeader(ftyp('isom'), 'mov')).toBe('mp4')
    expect(() => assertVideoHeader(ftyp('isom'), 'webm')).toThrow(/passen nicht/)
    expect(() => assertVideoHeader(new Uint8Array(16), 'mp4')).toThrow(/kein erkanntes/)
    const header = decodeVideoHeader(Buffer.from(ftyp('isom')).toString('base64'))
    expect(header).toHaveLength(16)
    expect(() => decodeVideoHeader('YQ==')).toThrow(/Dateikopf/)
    expect(() => decodeVideoHeader('')).toThrow(/Dateikopf/)
    expect(() => decodeVideoHeader('a'.repeat(130))).toThrow(/Dateikopf/)
  })
})
