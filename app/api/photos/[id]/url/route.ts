import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json } from '@/lib/http'
import { authorizePhotoVariantRead } from '@/lib/photo-access'
import { getPhotoRecord } from '@/lib/photo-service'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const signed = await authorizePhotoVariantRead({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      getPhoto: getPhotoRecord,
      photoId: (await context.params).id,
      variant: new URL(request.url).searchParams.get('variant'),
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json({ url: signed.url, expiresIn: signed.expiresIn })
  } catch (error) {
    return errorResponse(error)
  }
}
