import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'
import { parseApiListFilter } from '@/lib/gallery-filters'
import { listPhotoMonths } from '@/lib/photo-service'
import type { MediaFilter, PhotoScope } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const access = createRequestAccess()
    const session = await access.getSession()
    const member = await access.getMember()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
    const url = new URL(request.url)
    const scope: PhotoScope = url.searchParams.get('scope') === 'mine' ? 'mine' : 'group'
    const requested = url.searchParams.get('media')
    const media: MediaFilter = requested === 'photo' || requested === 'video' ? requested : 'all'
    const filter = parseApiListFilter(url.searchParams)
    if (!filter) throw new AppError(400, 'bad_request', 'Der Filter ist ungültig.')
    return json({ months: await listPhotoMonths(scope, media, filter) })
  } catch (error) {
    return errorResponse(error)
  }
}
