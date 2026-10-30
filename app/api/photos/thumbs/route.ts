import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json, readJson } from '@/lib/http'
import { authorizeThumbRefresh, requireRequestMember } from '@/lib/photo-access'
import { getPhotoRecords } from '@/lib/photo-service'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import { parseInput, thumbRefreshSchema } from '@/lib/validators'

export async function POST(request: Request) {
  try {
    await requireRequestMember(createRequestAccess())
    const input = parseInput(thumbRefreshSchema, await readJson(request))
    const result = await authorizeThumbRefresh({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      getPhotos: getPhotoRecords,
      ids: input.ids,
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
