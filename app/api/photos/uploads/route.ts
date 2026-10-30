import { randomUUID } from 'node:crypto'
import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json, readJson } from '@/lib/http'
import { authorizePhotoUploadFromBody } from '@/lib/photo-access'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import { parseInput, uploadRequestSchema } from '@/lib/validators'

export async function POST(request: Request) {
  try {
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
