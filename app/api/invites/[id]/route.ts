import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'
import { revokeInvite } from '@/lib/invite-service'
import { assertUuid } from '@/lib/keys'
import { assertCanManageMembers } from '@/lib/permissions'

async function requireAdmin() {
  const access = createRequestAccess()
  const session = await access.getSession()
  const member = await access.getMember()
  if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  assertCanManageMembers(member)
  return member
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await context.params
    await revokeInvite(assertUuid(id, 'Einladung'))
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
