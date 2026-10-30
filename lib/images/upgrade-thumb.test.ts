import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GalleryPhoto } from '@/lib/types'

const api = vi.hoisted(() => vi.fn())
const putWithProgress = vi.hoisted(() => vi.fn(async () => undefined))

vi.mock('@/lib/api-client', () => ({ api }))
vi.mock('@/lib/browser-upload', () => ({ putWithProgress }))
vi.mock('@/lib/images/render-thumbs', () => ({
  renderThumbSet: async () => ({
    small: new Blob(['s']),
    large: new Blob(['l']),
    blurData: `data:image/jpeg;base64,${'a'.repeat(40)}`,
    contentType: 'image/jpeg' as const,
  }),
}))

const photo: GalleryPhoto = {
  id: '44444444-4444-4444-8444-444444444444',
  ownerId: '11111111-1111-4111-8111-111111111111',
  filename: 'a.jpg',
  contentType: 'image/jpeg',
  byteSize: 10,
  width: 10,
  height: 10,
  capturedAt: '2024-07-01T00:00:00.000Z',
  createdAt: '2024-07-01T00:00:00.000Z',
  uploaderName: 'Ada',
  thumbUrl: 'https://signed.example/thumb.jpg',
}

describe('upgradeLegacyThumb', () => {
  beforeEach(() => {
    api.mockReset()
    putWithProgress.mockClear()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })))
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 40, height: 30, close: () => undefined })))
  })

  it('does nothing when the tile already has a placeholder', async () => {
    const { upgradeLegacyThumb } = await import('@/lib/images/upgrade-thumb')
    await upgradeLegacyThumb({ ...photo, blurData: 'data:image/jpeg;base64,aaa' })
    expect(api).not.toHaveBeenCalled()
  })

  it('uploads both sizes and stores the blur placeholder', async () => {
    api.mockImplementation(async (_path: string, init?: RequestInit) => {
      if (init?.body === '{}') {
        return {
          thumb: { url: 'https://signed.example/320', contentType: 'image/jpeg' },
          thumbLarge: { url: 'https://signed.example/640', contentType: 'image/jpeg' },
        }
      }
      return { ok: true }
    })
    const { upgradeLegacyThumb } = await import('@/lib/images/upgrade-thumb')
    await upgradeLegacyThumb(photo)
    expect(putWithProgress).toHaveBeenCalledTimes(2)
    expect(api).toHaveBeenCalledTimes(2)
  })

  it('stops when the old thumbnail cannot be fetched', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })))
    const { upgradeLegacyThumb } = await import('@/lib/images/upgrade-thumb')
    await expect(upgradeLegacyThumb(photo)).rejects.toThrow(/alte Vorschau/)
  })
})
