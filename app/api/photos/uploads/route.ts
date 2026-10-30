import { randomUUID } from 'node:crypto'
import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json, readJson } from '@/lib/http'
import { isE2ERequest } from '@/lib/e2e-guard'
import { e2eUploadGrant } from '@/lib/e2e-store'
import { authorizePhotoUploadFromBody, requireRequestMember } from '@/lib/photo-access'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import { parseInput, uploadRequestSchema } from '@/lib/validators'

export async function POST(request: Request) {
  try {
    if (await isE2ERequest()) {
      const member = await requireRequestMember(createRequestAccess())
      const input = parseInput(uploadRequestSchema, await readJson(request))
      return json(e2eUploadGrant(member, input.filename, input.contentType ?? ''))
    }
    const grant = await authorizePhotoUploadFromBody({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      photoId: randomUUID(),
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
      readBody: () => readJson(request),
      parseBody: (body) => parseInput(uploadRequestSchema, body),
    })
    return json(grant)
  } catch (error) {
    return errorResponse(error)
  }
}
