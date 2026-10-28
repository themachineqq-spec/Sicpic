import { createRequestAccess } from '@/lib/auth'
import { updateFeedbackStatus } from '@/lib/feedback-service'
import { errorResponse, json, readJson } from '@/lib/http'
import { authorizeFeedbackModeration } from '@/lib/photo-access'
import { feedbackStatusSchema, parseInput } from '@/lib/validators'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const input = parseInput(feedbackStatusSchema, await readJson(request))
    const decision = await authorizeFeedbackModeration({
      ...createRequestAccess(),
      status: input.status,
    })
    await updateFeedbackStatus(id, decision.status)
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
