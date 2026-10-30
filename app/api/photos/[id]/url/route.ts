import { createRequestAccess } from '@/lib/auth'
import { isE2ERequest } from '@/lib/e2e-guard'
import { e2ePhotoRecord } from '@/lib/e2e-store'
import { errorResponse, json } from '@/lib/http'
import { authorizePhotoVariantRead, requireRequestMember } from '@/lib/photo-access'
import { getPhotoRecord } from '@/lib/photo-service'
import { readPresignExpiry } from '@/lib/presign'
import { createLazyR2Signer } from '@/lib/r2'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url)
    const photoId = (await context.params).id
    if (await isE2ERequest()) {
      const record = e2ePhotoRecord(photoId)
      if (record?.mediaType === 'video') {
        await requireRequestMember(createRequestAccess())
        const slot = url.searchParams.get('variant') === 'thumb' ? 'thumb' : 'original'
        const download = url.searchParams.get('download') === '1' ? '&download=1' : ''
        return json({ url: `/api/e2e/media?photoId=${photoId}&slot=${slot}${download}`, expiresIn: 300 })
      }
    }
    const signed = await authorizePhotoVariantRead({
      ...createRequestAccess(),
      signer: createLazyR2Signer(),
      getPhoto: getPhotoRecord,
      photoId,
      variant: url.searchParams.get('variant'),
      download: url.searchParams.get('download') === '1',
      expiresIn: readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS),
    })
    return json({ url: signed.url, expiresIn: signed.expiresIn })
  } catch (error) {
    return errorResponse(error)
  }
}
