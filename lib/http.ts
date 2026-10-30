import { isAppError } from '@/lib/errors'

export function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'private, no-store',
      'CDN-Cache-Control': 'no-store',
      Vary: 'Cookie',
    },
  })
}

const PRERENDER_BAILOUT = new Set(['NEXT_PRERENDER_INTERRUPTED', 'HANGING_PROMISE_REJECTION'])

export function errorResponse(error: unknown): Response {
  if (
    error &&
    typeof error === 'object' &&
    'digest' in error &&
    PRERENDER_BAILOUT.has(String(error.digest))
  ) {
    throw error
  }
  if (isAppError(error)) {
    return json({ error: error.code, message: error.message }, error.status)
  }
  console.error(error)
  return json({ error: 'server', message: 'Etwas ist schiefgelaufen.' }, 500)
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}
