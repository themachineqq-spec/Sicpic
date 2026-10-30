import { beforeEach, describe, expect, it, vi } from 'vitest'

const heic2any = vi.fn()
const exifrParse = vi.fn()

vi.mock('heic2any', () => ({ default: (...args: unknown[]) => heic2any(...args) }))
vi.mock('exifr', () => ({ default: { parse: (...args: unknown[]) => exifrParse(...args) } }))

describe('preparePhotoFile', () => {
  beforeEach(() => {
    heic2any.mockReset()
    exifrParse.mockReset()
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 2000, close: () => undefined }))
    vi.stubGlobal('document', {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['jpeg'], { type: 'image/jpeg' })),
      }),
    })
  })

  it('converts HEIC with heic2any and falls back when EXIF is corrupt', async () => {
    heic2any.mockResolvedValue(new Blob(['display'], { type: 'image/jpeg' }))
    exifrParse.mockRejectedValue(new Error('corrupt exif'))
    const { preparePhotoFile } = await import('@/lib/images/prepare-photo')
    const file = new File([new Uint8Array([1, 2, 3])], 'ferien.heic', { type: 'image/heic' })
    const prepared = await preparePhotoFile(file)
    expect(heic2any).toHaveBeenCalled()
    expect(prepared.originalContentType).toBe('image/heic')
    expect(prepared.display).toBeInstanceOf(Blob)
    expect(prepared.thumb).toBeInstanceOf(Blob)
    expect(prepared.width).toBe(4000)
    expect(Math.abs(prepared.capturedAt.getTime() - Date.now())).toBeLessThan(5000)
  })

  it('does not call heic2any for JPEG and keeps DateTimeOriginal', async () => {
    exifrParse.mockResolvedValue({ DateTimeOriginal: '2024:07:01 15:30:45' })
    const { preparePhotoFile } = await import('@/lib/images/prepare-photo')
    const file = new File([new Uint8Array([1])], 'bild.jpg', { type: 'image/jpeg' })
    const prepared = await preparePhotoFile(file)
    expect(heic2any).not.toHaveBeenCalled()
    expect(prepared.capturedAt.toISOString()).toBe('2024-07-01T13:30:45.000Z')
  })

  it('turns a multi-frame HEIC into one JPEG and refuses an unreadable bitmap', async () => {
    heic2any.mockResolvedValueOnce([new Blob(['frame'], { type: 'image/jpeg' })])
    exifrParse.mockResolvedValue({ CreateDate: '2024-07-01T12:00:00Z', OffsetTime: '+02:00' })
    const { preparePhotoFile } = await import('@/lib/images/prepare-photo')
    const file = new File([new Uint8Array([1])], 'seq.heic', { type: 'image/heic' })
    await expect(preparePhotoFile(file)).resolves.toMatchObject({ originalContentType: 'image/heic' })
    heic2any.mockResolvedValueOnce(null)
    await expect(preparePhotoFile(file)).rejects.toThrow(/HEIC/)
    vi.stubGlobal('createImageBitmap', async () => {
      throw new Error('decode')
    })
    const jpeg = new File([new Uint8Array([1])], 'bild.jpg', { type: 'image/jpeg' })
    exifrParse.mockResolvedValue(null)
    await expect(preparePhotoFile(jpeg)).rejects.toThrow(/nicht gelesen/)
  })

  it('reports a German error when HEIC conversion fails', async () => {
    heic2any.mockRejectedValue(new Error('boom'))
    exifrParse.mockResolvedValue(null)
    const { preparePhotoFile } = await import('@/lib/images/prepare-photo')
    const file = new File([new Uint8Array([1])], 'x.heic', { type: '' })
    await expect(preparePhotoFile(file)).rejects.toThrow(/HEIC konnte nicht umgewandelt werden/)
  })
})
