import { saveE2EBlob } from '@/lib/e2e-store'
import { isE2ERequest } from '@/lib/e2e-guard'
import { errorResponse, json } from '@/lib/http'

export async function PUT(request: Request) {
  try {
    if (!(await isE2ERequest())) return json({ error: 'not_found', message: 'Nicht gefunden.' }, 404)
    const url = new URL(request.url)
    const photoId = url.searchParams.get('photoId') ?? ''
    const slot = url.searchParams.get('slot') ?? ''
    const body = await request.arrayBuffer()
    saveE2EBlob(photoId, slot, body.byteLength)
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
