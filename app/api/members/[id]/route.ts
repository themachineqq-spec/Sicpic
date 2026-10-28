import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json, readJson } from '@/lib/http'
import { removeMember, updateMemberRole } from '@/lib/member-admin'
import { assertCanManageMembers } from '@/lib/permissions'
import { assertUuid } from '@/lib/keys'
import { memberRoleSchema, parseInput } from '@/lib/validators'

async function requireAdmin() {
  const access = createRequestAccess()
  const session = await access.getSession()
  const member = await access.getMember()
  if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  assertCanManageMembers(member)
  return member
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin()
    const { id } = await context.params
    const input = parseInput(memberRoleSchema, await readJson(request))
    await updateMemberRole(assertUuid(id, 'Mitglied'), input.role)
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin()
    const { id } = await context.params
    await removeMember(actor, assertUuid(id, 'Mitglied'))
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
