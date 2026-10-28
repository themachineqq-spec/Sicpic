import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { getFeedbackScreenshotKey } from '@/lib/feedback-service'
import { errorResponse, json } from '@/lib/http'
import { assertCanModerateFeedback } from '@/lib/permissions'
import { readPresignExpiry } from '@/lib/presign'
import { assertSafeObjectKey } from '@/lib/keys'
import { createLazyR2Signer } from '@/lib/r2'

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = createRequestAccess()
    const session = await access.getSession()
    const member = await access.getMember()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    assertCanModerateFeedback(member)
    const { id } = await context.params
    const key = await getFeedbackScreenshotKey(id)
    if (!key) throw new AppError(404, 'not_found', 'Kein Screenshot vorhanden.')
    assertSafeObjectKey(key)
    const expiresIn = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
    const url = await createLazyR2Signer().signGet({ key, expiresIn })
    return json({ url, expiresIn })
  } catch (error) {
    return errorResponse(error)
  }
}
