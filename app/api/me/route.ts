import { connection } from 'next/server'
import { getRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'

export async function GET() {
  await connection()
  try {
    const access = await getRequestAccess()
    if (!access.session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!access.member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
    return json({ member: access.member })
  } catch (error) {
    return errorResponse(error)
  }
}
