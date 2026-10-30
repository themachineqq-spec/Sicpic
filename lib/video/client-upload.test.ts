import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => vi.fn())
const putPart = vi.hoisted(() => vi.fn(async () => '"abc"'))
const putWithProgress = vi.hoisted(() => vi.fn(async () => undefined))
const prepareVideoFile = vi.hoisted(() => vi.fn())

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('@/lib/browser-upload', () => ({ putPart, putWithProgress }))
vi.mock('@/lib/video/prepare-video', () => ({ prepareVideoFile }))

const prepared = {
  file: new File([new Uint8Array(8)], 'clip.mp4', { type: 'video/mp4' }),
  filename: 'clip.mp4',
  contentType: 'video/mp4',
  byteSize: 8,
  header: 'aGVhZGVy',
  capturedAt: new Date('2024-07-01T12:00:00.000Z'),
  durationMs: 1000,
  width: 16,
  height: 9,
  codec: 'h264' as string | null,
  thumb: new Blob(['w']) as Blob | null,
}

describe('uploadPreparedVideo', () => {
  beforeEach(() => {
    api.mockReset()
    putPart.mockReset()
    putWithProgress.mockClear()
    prepareVideoFile.mockReset()
    prepareVideoFile.mockResolvedValue(prepared)
    putPart.mockResolvedValue('"abc"')
  })

  it('uploads the poster and the single part, then completes', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/api/media/uploads') {
        return { photoId: '44444444-4444-4444-8444-444444444444', uploadId: 'upload-12345678', partSize: 16 * 1024 * 1024, partCount: 1, contentType: 'video/mp4', thumb: { url: '/thumb', contentType: 'image/webp' } }
      }
      if (path === '/api/media/uploads/parts') return { parts: [{ partNumber: 1, url: 'https://signed.example/1' }] }
      return { id: '44444444-4444-4444-8444-444444444444' }
    })
    const { uploadPreparedVideo } = await import('@/lib/video/client-upload')
    const messages: string[] = []
    await uploadPreparedVideo(prepared.file, { onProgress: (_ratio, message) => messages.push(message) })
    expect(putWithProgress).toHaveBeenCalled()
    expect(putPart).toHaveBeenCalled()
    expect(messages.at(-1)).toBe('Gespeichert')
  })

  it('aborts the upload when a part cannot be signed', async () => {
    api.mockImplementation(async (path: string) => {
      if (path === '/api/media/uploads') {
        return { photoId: '44444444-4444-4444-8444-444444444444', uploadId: 'upload-12345678', partSize: 16 * 1024 * 1024, partCount: 1, contentType: 'video/mp4', thumb: null }
      }
      if (path === '/api/media/uploads/abort') return { ok: true }
      return { parts: [] }
    })
    prepareVideoFile.mockResolvedValue({ ...prepared, thumb: null })
    const { uploadPreparedVideo } = await import('@/lib/video/client-upload')
    await expect(uploadPreparedVideo(prepared.file, { onProgress: () => undefined })).rejects.toThrow(/nicht signiert/)
    expect(api).toHaveBeenCalledWith('/api/media/uploads/abort', expect.objectContaining({ method: 'POST' }))
  })
})
