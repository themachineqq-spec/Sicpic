import { createRequestAccess } from '@/lib/auth'
import { decodeCursor } from '@/lib/dates'
import { AppError } from '@/lib/errors'
import { parseApiListFilter } from '@/lib/gallery-filters'
import { errorResponse, json, readJson } from '@/lib/http'
import { completePhotoUpload, listPhotoPage } from '@/lib/photo-service'
import { parseInput, completePhotoSchema } from '@/lib/validators'
import type { MediaFilter, PhotoScope } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const gate = createRequestAccess()
    const access = await gate.getMember()
    const session = await gate.getSession()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!access) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')

    const url = new URL(request.url)
    const scope: PhotoScope = url.searchParams.get('scope') === 'mine' ? 'mine' : 'group'
    const cursor = decodeCursor(url.searchParams.get('cursor'))
    if (url.searchParams.get('cursor') && !cursor) {
      throw new AppError(400, 'bad_request', 'Der Seitenzeiger ist ungültig.')
    }
    const requested = url.searchParams.get('media')
    const media: MediaFilter | null =
      !requested || requested === 'all' ? 'all' : requested === 'photo' || requested === 'video' ? requested : null
    if (!media) throw new AppError(400, 'bad_request', 'Unbekannter Filter.')
    const filter = parseApiListFilter(url.searchParams)
    if (!filter) throw new AppError(400, 'bad_request', 'Der Filter ist ungültig.')
    return json(await listPhotoPage(scope, cursor, media, filter))
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const access = createRequestAccess()
    const session = await access.getSession()
    const member = await access.getMember()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!member || (member.userId && member.userId !== session.userId)) {
      throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
    }
    const input = parseInput(completePhotoSchema, await readJson(request))
    const result = await completePhotoUpload({ member, ...input })
    return json(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
