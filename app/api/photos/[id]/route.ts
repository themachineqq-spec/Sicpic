import { createRequestAccess } from '@/lib/auth'
import { errorResponse, json } from '@/lib/http'
import { authorizePhotoDelete } from '@/lib/photo-access'
import { deletePhotoRecord, getPhotoRecord } from '@/lib/photo-service'
import { deleteR2Objects } from '@/lib/r2'

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params
    await authorizePhotoDelete({
      ...createRequestAccess(),
      getPhoto: getPhotoRecord,
      deletePhoto: deletePhotoRecord,
      deleteObjects: deleteR2Objects,
      photoId: id,
    })
    return json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
