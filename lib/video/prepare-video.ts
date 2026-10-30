import { resolveVideoType } from '@/lib/content-types'
import { renderThumbSet, type ThumbSet } from '@/lib/images/render-thumbs'
import { sanitizeFilename } from '@/lib/keys'
import { assertVideoHeader } from '@/lib/video/magic'
import { mergeVideoMetadata, parseVideoMetadata, resolveVideoCapturedAt } from '@/lib/video/metadata'

export type PreparedVideo = {
  file: File
  filename: string
  contentType: string
  byteSize: number
  header: string
  capturedAt: Date
  durationMs: number
  width: number | null
  height: number | null
  codec: string | null
  thumb: Blob | null
  thumbLarge: Blob | null
  blurData: string | null
}

const HEAD_BYTES = 2 * 1024 * 1024

async function readSlice(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer())
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64')
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export async function defaultPoster(file: File): Promise<(ThumbSet & { width: number; height: number; durationMs: number }) | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  try {
    const loaded = new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve()
      video.onerror = () => reject(new Error('decode'))
    })
    video.src = url
    await loaded
    if (Number.isFinite(video.duration) && video.duration > 1) {
      const seeked = new Promise<void>((resolve) => {
        video.onseeked = () => resolve()
      })
      video.currentTime = 1
      await seeked
    }
    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return null
    const durationMs = Number.isFinite(video.duration) ? Math.max(0, Math.round(video.duration * 1000)) : 0
    const set = await renderThumbSet(video, width, height)
    return { ...set, width, height, durationMs }
  } catch {
    return null
  } finally {
    video.src = ''
    URL.revokeObjectURL(url)
  }
}

export async function prepareVideoFile(
  file: File,
  poster: typeof defaultPoster = defaultPoster,
): Promise<PreparedVideo> {
  const video = resolveVideoType(file.type, file.name)
  const head = await readSlice(file, 0, Math.min(file.size, 32))
  assertVideoHeader(head, video.extension)
  const chunks = [await readSlice(file, 0, Math.min(file.size, HEAD_BYTES))]
  if (file.size > HEAD_BYTES) {
    chunks.push(await readSlice(file, Math.max(0, file.size - HEAD_BYTES), file.size))
  }
  const metadata = mergeVideoMetadata(chunks.map((chunk) => parseVideoMetadata(chunk)))
  const frame = await poster(file)
  const capturedAt = resolveVideoCapturedAt({
    appleDate: metadata.appleDate,
    mvhdDate: metadata.mvhdDate,
    lastModified: Number.isFinite(file.lastModified) ? file.lastModified : null,
    uploadDate: new Date(),
  })
  return {
    file,
    filename: sanitizeFilename(file.name),
    contentType: video.contentType,
    byteSize: file.size,
    header: bytesToBase64(head),
    capturedAt,
    durationMs: metadata.durationMs ?? frame?.durationMs ?? 0,
    width: metadata.width ?? frame?.width ?? null,
    height: metadata.height ?? frame?.height ?? null,
    codec: metadata.codec,
    thumb: frame?.small ?? null,
    thumbLarge: frame?.large ?? null,
    blurData: frame?.blurData ?? null,
  }
}
