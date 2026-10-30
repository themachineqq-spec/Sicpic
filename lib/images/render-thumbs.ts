import { THUMB_BLUR_EDGE, THUMB_LARGE_EDGE, THUMB_SMALL_EDGE } from '@/lib/images/thumbs'

export type ThumbSet = {
  small: Blob
  large: Blob
  blurData: string
  contentType: 'image/webp' | 'image/jpeg'
}

function fit(width: number, height: number, maxEdge: number) {
  const longest = Math.max(width, height)
  const scale = longest > maxEdge ? maxEdge / longest : 1
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

async function webpSupported(): Promise<boolean> {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const blob = await canvasBlob(canvas, 'image/webp', 0.8)
  return Boolean(blob && blob.type === 'image/webp')
}

async function renderEdge(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
  quality: number,
  type: 'image/webp' | 'image/jpeg',
): Promise<Blob> {
  const size = fit(width, height, maxEdge)
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Der Browser kann keine Vorschau erzeugen.')
  context.drawImage(source, 0, 0, size.width, size.height)
  const blob = await canvasBlob(canvas, type, quality)
  if (!blob) throw new Error('Die Vorschau konnte nicht erzeugt werden.')
  return blob
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:${blob.type || 'image/jpeg'};base64,${btoa(binary)}`
}

export async function renderThumbSet(source: CanvasImageSource, width: number, height: number): Promise<ThumbSet> {
  const contentType = (await webpSupported()) ? 'image/webp' : 'image/jpeg'
  const [small, large, blur] = await Promise.all([
    renderEdge(source, width, height, THUMB_SMALL_EDGE, 0.78, contentType),
    renderEdge(source, width, height, THUMB_LARGE_EDGE, 0.8, contentType),
    renderEdge(source, width, height, THUMB_BLUR_EDGE, 0.45, 'image/jpeg'),
  ])
  return { small, large, blurData: await blobToDataUrl(blur), contentType }
}
