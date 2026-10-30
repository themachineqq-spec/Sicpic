import { api } from '@/lib/api-client'
import { putWithProgress } from '@/lib/browser-upload'
import { renderThumbSet } from '@/lib/images/render-thumbs'
import { THUMB_CACHE_CONTROL } from '@/lib/images/thumbs'
import type { GalleryPhoto } from '@/lib/types'

export async function upgradeLegacyThumb(photo: GalleryPhoto): Promise<void> {
  if (!photo.thumbUrl || photo.blurData) return
  const response = await fetch(photo.thumbUrl)
  if (!response.ok) throw new Error('Die alte Vorschau konnte nicht geladen werden.')
  const bitmap = await createImageBitmap(await response.blob())
  try {
    const set = await renderThumbSet(bitmap, bitmap.width, bitmap.height)
    const grant = await api<{
      thumb: { url: string; contentType: string }
      thumbLarge: { url: string; contentType: string }
    }>(`/api/photos/${photo.id}/thumb-upgrade`, { method: 'POST', body: '{}' })
    const headers = { 'Cache-Control': THUMB_CACHE_CONTROL }
    await putWithProgress(grant.thumb.url, set.small, set.contentType, () => undefined, headers)
    await putWithProgress(grant.thumbLarge.url, set.large, set.contentType, () => undefined, headers)
    await api(`/api/photos/${photo.id}/thumb-upgrade`, {
      method: 'POST',
      body: JSON.stringify({ blurData: set.blurData, contentType: set.contentType }),
    })
  } finally {
    bitmap.close()
  }
}
