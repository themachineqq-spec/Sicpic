import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { createFeedback, listFeedback } from '@/lib/feedback-service'
import { errorResponse, json, readJson } from '@/lib/http'
import { assertCanModerateFeedback } from '@/lib/permissions'
import { feedbackSchema, parseInput } from '@/lib/validators'

async function requireMember() {
  const access = createRequestAccess()
  const session = await access.getSession()
  const member = await access.getMember()
  if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
  if (!member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
  return member
}

export async function GET(request: Request) {
  try {
    const member = await requireMember()
    assertCanModerateFeedback(member)
    const url = new URL(request.url)
    const items = await listFeedback({
      kind: url.searchParams.get('kind'),
      status: url.searchParams.get('status'),
    })
    return json({ items })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember()
    const input = parseInput(feedbackSchema, await readJson(request))
    const result = await createFeedback({
      member,
      id: input.id,
      kind: input.kind,
      title: input.title,
      body: input.body,
      screenshotContentType: input.screenshotContentType,
    })
    return json(result, 201)
  } catch (error) {
    return errorResponse(error)
  }
}
