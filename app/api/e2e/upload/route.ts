import { saveE2EBytes } from '@/lib/e2e-store'
import { isE2ERequest } from '@/lib/e2e-guard'
import { errorResponse, json } from '@/lib/http'

export async function PUT(request: Request) {
  try {
    if (!(await isE2ERequest())) return json({ error: 'not_found', message: 'Nicht gefunden.' }, 404)
    const url = new URL(request.url)
    const photoId = url.searchParams.get('photoId') ?? ''
    const slot = url.searchParams.get('slot') ?? ''
    const part = url.searchParams.get('n')
    const slotName = slot === 'part' ? `part:${part ?? ''}` : slot
    const body = new Uint8Array(await request.arrayBuffer())
    const etag = saveE2EBytes(photoId, slotName, body)
    const response = json({ ok: true })
    response.headers.set('ETag', etag)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
