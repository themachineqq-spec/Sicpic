import { connection } from 'next/server'
import { isE2ERequest } from '@/lib/e2e-guard'
import { readE2EMedia } from '@/lib/e2e-store'
import { errorResponse } from '@/lib/http'

export async function GET(request: Request) {
  await connection()
  try {
    if (!(await isE2ERequest())) return new Response(null, { status: 404 })
    const url = new URL(request.url)
    const photoId = url.searchParams.get('photoId') ?? ''
    const slot = url.searchParams.get('slot') === 'thumb' ? 'thumb' : 'original'
    const bytes = readE2EMedia(photoId, slot)
    if (!bytes) return new Response(null, { status: 404 })
    const type = slot === 'thumb' ? 'image/webp' : 'video/mp4'
    const download = url.searchParams.get('download') === '1'
    const range = request.headers.get('range')
    const headers = new Headers({
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, no-store',
      'Content-Type': type,
    })
    if (download) headers.set('Content-Disposition', 'attachment; filename="video"')
    const match = range?.match(/bytes=(\d+)-(\d+)?/)
    if (!match) {
      headers.set('Content-Length', String(bytes.byteLength))
      return new Response(new Uint8Array(bytes), { status: 200, headers })
    }
    const start = Number(match[1])
    const end = match[2] ? Number(match[2]) : bytes.byteLength - 1
    if (start > end || start >= bytes.byteLength) return new Response(null, { status: 416 })
    const slice = bytes.subarray(start, end + 1)
    headers.set('Content-Length', String(slice.byteLength))
    headers.set('Content-Range', `bytes ${start}-${end}/${bytes.byteLength}`)
    return new Response(new Uint8Array(slice), { status: 206, headers })
  } catch (error) {
    return errorResponse(error)
  }
}
