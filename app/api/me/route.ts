import { connection } from 'next/server'
import { getRequestAccess } from '@/lib/auth'
import { assertDisplayName } from '@/lib/display-name'
import { AppError } from '@/lib/errors'
import { errorResponse, json, readJson } from '@/lib/http'
import { updateOwnDisplayName } from '@/lib/profile'

async function requireMember() {
  const access = await getRequestAccess()
  if (!access.session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  if (!access.member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
  return access.member
}

export async function GET() {
  await connection()
  try {
    return json({ member: await requireMember() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PATCH(request: Request) {
  await connection()
  try {
    const member = await requireMember()
    const body = await readJson(request)
    const raw = body && typeof body === 'object' && 'displayName' in body ? String(body.displayName ?? '') : ''
    const displayName = assertDisplayName(raw)
    const updated = await updateOwnDisplayName(member, displayName)
    return json({ member: updated })
  } catch (error) {
    return errorResponse(error)
  }
}
