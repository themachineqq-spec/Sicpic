import { createRequestAccess } from '@/lib/auth'
import { isE2ERequest } from '@/lib/e2e-guard'
import { abortE2EVideo } from '@/lib/e2e-store'
import { errorResponse, json, readJson } from '@/lib/http'
import { requireRequestMember } from '@/lib/photo-access'
import { parseInput, videoAbortSchema } from '@/lib/validators'
import { cancelVideoUpload } from '@/lib/video/session'

export async function POST(request: Request) {
  try {
    const member = await requireRequestMember(createRequestAccess())
    const input = parseInput(videoAbortSchema, await readJson(request))
    if (await isE2ERequest()) {
      abortE2EVideo(input.photoId, input.uploadId)
      return json({ ok: true })
    }
    await cancelVideoUpload(member, input)
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
