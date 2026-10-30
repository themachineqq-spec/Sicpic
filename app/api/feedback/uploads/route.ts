import { randomUUID } from 'node:crypto'
import { createRequestAccess } from '@/lib/auth'
import { authorizeFeedbackScreenshot, requireRequestMember } from '@/lib/photo-access'
import { errorResponse, json, readJson } from '@/lib/http'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import { feedbackUploadSchema, parseInput } from '@/lib/validators'

export async function POST(request: Request) {
  try {
    await requireRequestMember(createRequestAccess())
    const input = parseInput(feedbackUploadSchema, await readJson(request))
    const grant = await authorizeFeedbackScreenshot({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      feedbackId: randomUUID(),
      contentType: input.contentType,
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json(grant)
  } catch (error) {
    return errorResponse(error)
  }
}
