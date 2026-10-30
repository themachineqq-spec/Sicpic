// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bytesToBase64, defaultPoster, prepareVideoFile } from '@/lib/video/prepare-video'

function ftyp(): Uint8Array {
  const bytes = new Uint8Array(16)
  new DataView(bytes.buffer).setUint32(0, 16)
  bytes.set([0x66, 0x74, 0x79, 0x70], 4)
  bytes.set([0x69, 0x73, 0x6f, 0x6d], 8)
  return bytes
}

describe('defaultPoster', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('draws one second into the video and returns a webp', async () => {
    const original = document.createElement.bind(document)
    const video = {
      preload: '',
      muted: false,
      playsInline: false,
      videoWidth: 800,
      videoHeight: 400,
      duration: 3,
      onloadeddata: null as null | (() => void),
      onerror: null as null | (() => void),
      onseeked: null as null | (() => void),
      set src(_value: string) {
        queueMicrotask(() => this.onloadeddata?.())
      },
      set currentTime(_value: number) {
        queueMicrotask(() => this.onseeked?.())
      },
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => undefined }),
      toBlob: (callback: (blob: Blob | null) => void) => callback(new Blob(['webp'], { type: 'image/webp' })),
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return video as unknown as HTMLVideoElement
      if (tag === 'canvas') return canvas as unknown as HTMLCanvasElement
      return original(tag)
    })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: () => undefined })
    const poster = await defaultPoster(new File([Buffer.from(ftyp())], 'a.mp4', { type: 'video/mp4' }))
    expect(poster?.width).toBe(800)
    expect(poster?.blob.type).toBe('image/webp')
    expect(poster?.durationMs).toBe(3000)
  })

  it('returns null when the browser cannot decode the file', async () => {
    const original = document.createElement.bind(document)
    const video = {
      preload: '',
      muted: false,
      playsInline: false,
      onloadeddata: null as null | (() => void),
      onerror: null as null | (() => void),
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.())
      },
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return video as unknown as HTMLVideoElement
      return original(tag)
    })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: () => undefined })
    await expect(defaultPoster(new File([Buffer.from(ftyp())], 'a.mp4', { type: 'video/mp4' }))).resolves.toBeNull()
  })

  it('returns null when the canvas cannot encode a poster', async () => {
    const original = document.createElement.bind(document)
    const video = {
      preload: '',
      muted: false,
      playsInline: false,
      videoWidth: 100,
      videoHeight: 80,
      duration: 0.4,
      onloadeddata: null as null | (() => void),
      onerror: null as null | (() => void),
      set src(_value: string) {
        queueMicrotask(() => this.onloadeddata?.())
      },
    }
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'video') return video as unknown as HTMLVideoElement
      if (tag === 'canvas') {
        return { width: 0, height: 0, getContext: () => null, toBlob: () => undefined } as unknown as HTMLCanvasElement
      }
      return original(tag)
    })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:video', revokeObjectURL: () => undefined })
    await expect(defaultPoster(new File([Buffer.from(ftyp())], 'a.mp4', { type: 'video/mp4' }))).resolves.toBeNull()
    const saved = globalThis.Buffer
    // @ts-expect-error exercise the browser encoder
    delete globalThis.Buffer
    expect(bytesToBase64(new Uint8Array([65, 66]))).toBe('QUI=')
    globalThis.Buffer = saved
  })
})

describe('large files', () => {
  it('also reads the end of the file when the moov atom is not at the front', async () => {
    const head = ftyp()
    const padding = new Uint8Array(2 * 1024 * 1024 + 64)
    padding.set(head, 0)
    const file = new File([Buffer.from(padding)], 'long.mp4', { type: 'video/mp4' })
    const prepared = await prepareVideoFile(file, async () => null)
    expect(prepared.byteSize).toBe(padding.byteLength)
    expect(prepared.thumb).toBeNull()
  })
})
