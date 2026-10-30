import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import { errorResponse, json, readJson } from '@/lib/http'

describe('http helpers', () => {
  it('hides unexpected errors and keeps known ones', async () => {
    const ok = await json({ ok: true }, 201).json()
    expect(ok).toEqual({ ok: true })
    const known = await errorResponse(new AppError(403, 'forbidden', 'Nein.')).json()
    expect(known).toEqual({ error: 'forbidden', message: 'Nein.' })
    const leaked = await errorResponse(new Error('bucket secret key')).json()
    expect(JSON.stringify(leaked)).not.toContain('secret')
    expect(leaked).toEqual({ error: 'server', message: 'Etwas ist schiefgelaufen.' })
    expect(await readJson(new Request('http://local', { method: 'POST', body: 'nope' }))).toBeNull()
    expect(await readJson(new Request('http://local', { method: 'POST', body: '{"a":1}' }))).toEqual({ a: 1 })
    expect(() => errorResponse({ digest: 'HANGING_PROMISE_REJECTION' })).toThrow(
      expect.objectContaining({ digest: 'HANGING_PROMISE_REJECTION' }),
    )
    expect(() => errorResponse({ digest: 'NEXT_PRERENDER_INTERRUPTED' })).toThrow(
      expect.objectContaining({ digest: 'NEXT_PRERENDER_INTERRUPTED' }),
    )
  })
})
