import { api } from '@/lib/api-client'
import { putPart, putWithProgress } from '@/lib/browser-upload'
import { THUMB_CACHE_CONTROL } from '@/lib/images/thumbs'
import { prepareVideoFile, type PreparedVideo } from '@/lib/video/prepare-video'
import { uploadVideoParts } from '@/lib/video/multipart'

type InitGrant = {
  photoId: string
  uploadId: string
  partSize: number
  partCount: number
  contentType: string
  thumb: { url: string; contentType: string } | null
  thumbLarge?: { url: string; contentType: string } | null
}

export async function uploadPreparedVideo(
  file: File,
  hooks: { onProgress: (ratio: number, message: string) => void },
): Promise<void> {
  hooks.onProgress(0.02, 'Wird vorbereitet…')
  const prepared = await prepareVideoFile(file)
  hooks.onProgress(0.08, 'Wird hochgeladen…')
  const init = await api<InitGrant>('/api/media/uploads', {
    method: 'POST',
    body: JSON.stringify({
      filename: prepared.filename,
      contentType: prepared.contentType,
      byteSize: prepared.byteSize,
      header: prepared.header,
    }),
  })
  try {
    await sendVideo(prepared, init, hooks.onProgress)
  } catch (error) {
    await api('/api/media/uploads/abort', {
      method: 'POST',
      body: JSON.stringify({
        photoId: init.photoId,
        uploadId: init.uploadId,
        filename: prepared.filename,
        contentType: prepared.contentType,
      }),
    }).catch(() => undefined)
    throw error
  }
}

async function sendVideo(
  prepared: PreparedVideo,
  init: InitGrant,
  onProgress: (ratio: number, message: string) => void,
) {
  const thumbHeaders = { 'Cache-Control': THUMB_CACHE_CONTROL }
  if (prepared.thumb && init.thumb) {
    await putWithProgress(init.thumb.url, prepared.thumb, init.thumb.contentType, () => undefined, thumbHeaders)
  }
  if (prepared.thumbLarge && init.thumbLarge) {
    await putWithProgress(init.thumbLarge.url, prepared.thumbLarge, init.thumbLarge.contentType, () => undefined, thumbHeaders)
  }
  const parts = await uploadVideoParts({
    byteSize: prepared.byteSize,
    partSize: init.partSize,
    getUrl: async (partNumber) => {
      const signed = await api<{ parts: { partNumber: number; url: string }[] }>('/api/media/uploads/parts', {
        method: 'POST',
        body: JSON.stringify({
          photoId: init.photoId,
          uploadId: init.uploadId,
          filename: prepared.filename,
          contentType: prepared.contentType,
          partNumbers: [partNumber],
        }),
      })
      const url = signed.parts.find((part) => part.partNumber === partNumber)?.url
      if (!url) throw new Error('Ein Upload-Teil konnte nicht signiert werden.')
      return url
    },
    slice: (start, end) => prepared.file.slice(start, end),
    put: putPart,
    onProgress: (ratio) => onProgress(0.1 + ratio * 0.8, 'Wird hochgeladen…'),
  })
  await api('/api/media/uploads/complete', {
    method: 'POST',
    body: JSON.stringify({
      photoId: init.photoId,
      uploadId: init.uploadId,
      filename: prepared.filename,
      contentType: prepared.contentType,
      byteSize: prepared.byteSize,
      width: prepared.width,
      height: prepared.height,
      capturedAt: prepared.capturedAt.toISOString(),
      durationMs: prepared.durationMs,
      codec: prepared.codec,
      hasThumb: Boolean(prepared.thumb && init.thumb),
      parts,
    }),
  })
  onProgress(1, 'Gespeichert')
}
