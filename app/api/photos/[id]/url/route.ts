import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { errorResponse, json } from '@/lib/http'
import { authorizePhotoRead } from '@/lib/photo-access'
import { getPhotoRecord } from '@/lib/photo-service'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'
import type { PhotoVariant } from '@/lib/types'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    const variant = new URL(request.url).searchParams.get('variant')
    if (variant !== 'original' && variant !== 'display' && variant !== 'thumb') {
      throw new AppError(400, 'bad_request', 'Unbekannte Bildvariante.')
    }
    const signed = await authorizePhotoRead({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      getPhoto: getPhotoRecord,
      photoId: id,
      variant: variant as PhotoVariant,
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json({ url: signed.url, expiresIn: signed.expiresIn })
  } catch (error) {
    return errorResponse(error)
  }
}
