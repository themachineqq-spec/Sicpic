import { createRequestAccess } from '@/lib/auth'
import { isE2ERequest } from '@/lib/e2e-guard'
import { completeE2EVideo } from '@/lib/e2e-store'
import { errorResponse, json, readJson } from '@/lib/http'
import { requireRequestMember } from '@/lib/photo-access'
import { parseInput, videoCompleteSchema } from '@/lib/validators'
import { finishVideoUpload } from '@/lib/video/session'

export async function POST(request: Request) {
  try {
    const member = await requireRequestMember(createRequestAccess())
    const input = parseInput(videoCompleteSchema, await readJson(request))
    if (await isE2ERequest()) return json(completeE2EVideo({ member, ...input }), 201)
    return json(await finishVideoUpload(member, input), 201)
  } catch (error) {
    return errorResponse(error)
  }
}
