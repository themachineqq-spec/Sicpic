import { createRequestAccess } from '@/lib/auth'
import { AppError } from '@/lib/errors'
import { THUMB_CACHE_CONTROL } from '@/lib/images/thumbs'
import { errorResponse, json, readJson } from '@/lib/http'
import { photoThumbKeys } from '@/lib/keys'
import { attachThumbSet, getPhotoRecord } from '@/lib/photo-service'
import { assertCanDeletePhoto } from '@/lib/permissions'
import { readPresignExpiry } from '@/lib/presign'
import { createR2Signer } from '@/lib/r2'
import { parseInput } from '@/lib/validators'
import { z } from 'zod'

const finishSchema = z.object({
  blurData: z.string().trim().min(32).max(2000),
  contentType: z.enum(['image/webp', 'image/jpeg']),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const access = createRequestAccess()
    const session = await access.getSession()
    const member = await access.getMember()
    if (!session) throw new AppError(401, 'unauthorized', 'Bitte melde dich an.')
    if (!member) throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
    const photo = await getPhotoRecord((await context.params).id)
    if (!photo) throw new AppError(404, 'not_found', 'Foto nicht gefunden.')
    assertCanDeletePhoto(member, photo)
    const body = await readJson(request)
    if (body && typeof body === 'object' && 'blurData' in body) {
      const input = parseInput(finishSchema, body)
      const keys = photoThumbKeys(member.id, photo.id, input.contentType === 'image/webp' ? 'webp' : 'jpg')
      await attachThumbSet(photo.id, keys.thumb, keys.thumbLarge, input.blurData)
      return json({ ok: true })
    }
    const expiresIn = readPresignExpiry(process.env.PRESIGN_EXPIRES_SECONDS)
    const keys = photoThumbKeys(member.id, photo.id, 'webp')
    const signer = createR2Signer()
    const [thumbUrl, largeUrl] = await Promise.all([
      signer.signPut({ key: keys.thumb, contentType: 'image/webp', expiresIn, cacheControl: THUMB_CACHE_CONTROL }),
      signer.signPut({ key: keys.thumbLarge, contentType: 'image/webp', expiresIn, cacheControl: THUMB_CACHE_CONTROL }),
    ])
    return json({
      thumb: { url: thumbUrl, contentType: 'image/webp', cacheControl: THUMB_CACHE_CONTROL },
      thumbLarge: { url: largeUrl, contentType: 'image/webp', cacheControl: THUMB_CACHE_CONTROL },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
