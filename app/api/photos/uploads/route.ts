import { randomUUID } from 'node:crypto'
import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json, readJson } from '@/lib/http'
import { authorizePhotoUpload } from '@/lib/photo-access'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import { parseInput, uploadRequestSchema } from '@/lib/validators'

export async function POST(request: Request) {
  try {
    const input = parseInput(uploadRequestSchema, await readJson(request))
    const grant = await authorizePhotoUpload({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      photoId: randomUUID(),
      filename: input.filename,
      contentType: input.contentType ?? '',
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json(grant)
  } catch (error) {
    return errorResponse(error)
  }
}
