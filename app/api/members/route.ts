import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json, readJson } from '@/lib/http'
import { addMember, listMembers } from '@/lib/member-admin'
import { assertCanManageMembers } from '@/lib/permissions'
import { memberCreateSchema, parseInput } from '@/lib/validators'

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
    return json({ members: await listMembers() })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const input = parseInput(memberCreateSchema, await readJson(request))
    const member = await addMember(input)
    return json({ member }, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
