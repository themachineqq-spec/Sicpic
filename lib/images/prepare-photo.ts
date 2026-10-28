import { isHeicExtension, resolveOriginalType } from '@/lib/content-types'
import { resolveCapturedAt } from '@/lib/dates'
import { sanitizeFilename } from '@/lib/keys'

export type PreparedPhoto = {
  filename: string
  original: Blob
  originalContentType: string
  display: Blob
  thumb: Blob
  width: number
  height: number
  capturedAt: Date
}

function fit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  const scale = longest > maxEdge ? maxEdge / longest : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function renderJpeg(bitmap: ImageBitmap, maxEdge: number, quality: number): Promise<Blob> {
  const size = fit(bitmap.width, bitmap.height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Der Browser kann keine Vorschau erzeugen.')
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error('Die JPEG-Vorschau konnte nicht erzeugt werden.'))
        else resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function bitmapFrom(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Dieses Bild kann auf diesem Gerät nicht gelesen werden.')
  }
}

async function heicToJpeg(file: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default
  const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
  const blob = Array.isArray(converted) ? converted[0] : converted
  if (!blob) throw new Error('HEIC konnte nicht in JPEG umgewandelt werden.')
  return blob
}

async function captureDate(file: File, uploadDate: Date): Promise<Date> {
  try {
    const exifr = (await import('exifr')).default
    const raw = await exifr.parse(file, {
      pick: ['DateTimeOriginal', 'CreateDate', 'OffsetTimeOriginal', 'OffsetTime'],
      reviveValues: false,
    })
    return resolveCapturedAt({
      dateTimeOriginal: raw?.DateTimeOriginal,
      createDate: raw?.CreateDate,
      offsetTimeOriginal: typeof raw?.OffsetTimeOriginal === 'string' ? raw.OffsetTimeOriginal : null,
      offsetTime: typeof raw?.OffsetTime === 'string' ? raw.OffsetTime : null,
      uploadDate,
    })
  } catch {
    return uploadDate
  }
}

export async function preparePhotoFile(file: File): Promise<PreparedPhoto> {
  const original = resolveOriginalType(file.type, file.name)
  const uploadDate = new Date()
  const capturedAt = await captureDate(file, uploadDate)
  let source: Blob = file
  if (isHeicExtension(original.extension)) {
    try {
      source = await heicToJpeg(file)
    } catch {
      throw new Error("HEIC konnte nicht umgewandelt werden. Bitte ein anderes Foto wählen.")
    }
  }
  const bitmap = await bitmapFrom(source)
  try {
    const [display, thumb] = await Promise.all([
      renderJpeg(bitmap, 2048, 0.86),
      renderJpeg(bitmap, 480, 0.74),
    ])
    return {
      filename: sanitizeFilename(file.name),
      original: file,
      originalContentType: original.contentType,
      display,
      thumb,
      width: bitmap.width,
      height: bitmap.height,
      capturedAt,
    }
  } finally {
    bitmap.close()
  }
}
