import { z } from 'zod'
import { AppError } from '@/lib/errors'

const uuid = z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, 'Ungültige ID.')

export const uploadRequestSchema = z.object({
  filename: z.string().trim().min(1, 'Dateiname fehlt.').max(200),
  contentType: z.string().trim().max(120).optional(),
})

export const completePhotoSchema = z.object({
  photoId: uuid,
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().max(120),
  width: z.number().int().positive().max(20000).nullable(),
  height: z.number().int().positive().max(20000).nullable(),
  capturedAt: z.string().trim().min(4),
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
