import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api } from '@/lib/api-client'

describe('api client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns json and surfaces the server message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } })),
    )
    await expect(api<{ ok: boolean }>('/api/me')).resolves.toEqual({ ok: true })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ message: 'Bitte melde dich an.' }), { status: 401 })),
    )
    await expect(api('/api/me')).rejects.toBeInstanceOf(ApiError)
    const withBody = vi.fn(async (_path: string, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
      return new Response('nope', { status: 500 })
    })
    vi.stubGlobal('fetch', withBody)
    await expect(api('/api/photos', { method: 'POST', body: '{}' })).rejects.toMatchObject({
      message: 'Das hat nicht geklappt.',
    })
  })
})
