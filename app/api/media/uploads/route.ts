import { createRequestAccess } from '@/lib/auth'
import { isE2ERequest } from '@/lib/e2e-guard'
import { beginE2EVideo } from '@/lib/e2e-store'
import { errorResponse, json, readJson } from '@/lib/http'
import { requireRequestMember } from '@/lib/photo-access'
import { parseInput, videoUploadSchema } from '@/lib/validators'
import { startVideoUpload } from '@/lib/video/session'

export async function POST(request: Request) {
  try {
    const member = await requireRequestMember(createRequestAccess())
    const input = parseInput(videoUploadSchema, await readJson(request))
    if (await isE2ERequest()) return json(beginE2EVideo(member, input))
    return json(await startVideoUpload(member, input))
  } catch (error) {
    return errorResponse(error)
  }
}
