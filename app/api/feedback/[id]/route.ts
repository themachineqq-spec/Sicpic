import { createRequestAccess } from '@/lib/auth'
import { updateFeedbackStatus } from '@/lib/feedback-service'
import { errorResponse, json, readJson } from '@/lib/http'
import { requireRequestMember } from '@/lib/photo-access'
import { assertAdmin, parseFeedbackStatus } from '@/lib/permissions'
import { feedbackStatusSchema, parseInput } from '@/lib/validators'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireRequestMember(createRequestAccess())
    assertAdmin(member)
    const { id } = await context.params
    const input = parseInput(feedbackStatusSchema, await readJson(request))
    await updateFeedbackStatus(id, parseFeedbackStatus(input.status))
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
