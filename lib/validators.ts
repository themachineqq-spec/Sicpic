import { z } from 'zod'
import { AppError } from '@/lib/errors'
import { VIDEO_MAX_BYTES } from '@/lib/video/multipart'

const uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Ungültige ID.')

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1, 'Dateiname fehlt.').max(200),
  contentType: z.string().trim().max(120).optional(),
  thumbContentType: z.enum(['image/webp', 'image/jpeg']).optional(),
})

export const completePhotoSchema = z.object({
  photoId: uuid,
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(120),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  capturedAt: z.string().trim().min(4),
  blurData: z.string().trim().min(32).max(2000).nullable().optional(),
  thumbContentType: z.enum(['image/webp', 'image/jpeg']).optional(),
})

export const videoUploadSchema = z.object({
  filename: z.string().trim().min(1, 'Dateiname fehlt.').max(200),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES),
  header: z.string().trim().min(16).max(120),
})

export const videoPartsSchema = z.object({
  photoId: uuid,
  uploadId: z.string().trim().min(8).max(1024),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(32),
})

export const videoCompleteSchema = z.object({
  photoId: uuid,
  uploadId: z.string().trim().min(8).max(1024),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
  byteSize: z.number().int().positive().max(VIDEO_MAX_BYTES),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  capturedAt: z.string().trim().min(4),
  durationMs: z.number().int().nonnegative().max(2_147_483_647),
  codec: z.string().trim().min(1).max(16).nullable(),
  hasThumb: z.boolean(),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive().max(10000),
        etag: z.string().trim().min(1).max(128),
      }),
    )
    .min(1)
    .max(10000),
})

export const videoAbortSchema = z.object({
  photoId: uuid,
  uploadId: z.string().trim().min(8).max(1024),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(120),
})

export const thumbRefreshSchema = z.object({
  ids: z.array(uuid).max(48),
})

export const feedbackUploadSchema = z.object({
  contentType: z.string().trim().min(1).max(120),
})

export const feedbackSchema = z.object({
  id: uuid,
  kind: z.enum(['bug', 'feature'], { error: 'Bitte Fehler oder Wunsch wählen.' }),
  title: z.string().trim().min(3, 'Der Titel ist zu kurz.').max(120, 'Der Titel ist zu lang.'),
  body: z.string().trim().min(5, 'Bitte beschreibe es etwas genauer.').max(4000),
  screenshotContentType: z.string().trim().max(120).nullable().optional(),
})

export const feedbackStatusSchema = z.object({
  status: z.enum(['neu', 'in_arbeit', 'erledigt']),
})

export const memberCreateSchema = z.object({
  email: z.string().trim().max(320),
  displayName: z.string().trim().max(80).optional(),
  role: z.enum(['admin', 'member']).optional(),
})

export const memberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
})

const ZOD_DEFAULT = /^(Invalid input|Invalid option|Too (big|small)|Expected )|^Unrecognized key/

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) {
    const raw = result.error.issues[0]?.message
    const message = raw && !ZOD_DEFAULT.test(raw) ? raw : 'Eingabe ist ungültig.'
    throw new AppError(400, 'bad_request', message)
  }
  return result.data
}
