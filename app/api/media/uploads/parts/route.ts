import { createRequestAccess } from '@/lib/auth'
import { isE2ERequest } from '@/lib/e2e-guard'
import { e2ePartUrls } from '@/lib/e2e-store'
import { errorResponse, json, readJson } from '@/lib/http'
import { requireRequestMember } from '@/lib/photo-access'
import { parseInput, videoPartsSchema } from '@/lib/validators'
import { signVideoParts } from '@/lib/video/session'

export async function POST(request: Request) {
  try {
    const member = await requireRequestMember(createRequestAccess())
    const input = parseInput(videoPartsSchema, await readJson(request))
    if (await isE2ERequest()) return json(e2ePartUrls(input.photoId, input.uploadId, input.partNumbers))
    return json(await signVideoParts(member, input))
  } catch (error) {
    return errorResponse(error)
  }
}
