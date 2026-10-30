import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'
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
    return json({ months: await listPhotoMonths(scope, media) })
  } catch (error) {
    return errorResponse(error)
  }
}
