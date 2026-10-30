import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'
import { listUploaders } from '@/lib/photo-service'
import type { PhotoScope } from '@/lib/types'

export async function GET(request: Request) {
  try {
    const access = createRequestAccess()
    const session = await access.getSession()
    const member = await access.getMember()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
    const scope: PhotoScope = new URL(request.url).searchParams.get('scope') === 'mine' ? 'mine' : 'group'
    return json({ people: await listUploaders(scope) })
  } catch (error) {
    return errorResponse(error)
  }
}
