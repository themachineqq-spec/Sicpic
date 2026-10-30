import { createRequestAccess } from '@/lib/auth'
import { appOrigin } from '@/lib/config'
import { AppError } from '@/lib/errors'
import { errorResponse, json, readJson } from '@/lib/http'
import { createInviteLink, listOpenInvites } from '@/lib/invite-service'
import { assertCanManageMembers } from '@/lib/permissions'
import { inviteCreateSchema, parseInput } from '@/lib/validators'

async function requireAdmin() {
  const access = createRequestAccess()
  const session = await access.getSession()
  const member = await access.getMember()
  if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  assertCanManageMembers(member)
  return member
}

export async function GET() {
  try {
    await requireAdmin()
    return json({ invites: await listOpenInvites() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin()
    const input = parseInput(inviteCreateSchema, await readJson(request))
    const invite = await createInviteLink(actor, appOrigin(request), input)
    return json({ invite }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
