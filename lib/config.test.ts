import { afterEach, describe, expect, it } from 'vitest'
import { appOrigin } from '@/lib/config'

describe('appOrigin', () => {
  const previous = process.env.NEXT_PUBLIC_APP_URL

  afterEach(() => {
    if (previous === undefined) delete process.env.NEXT_PUBLIC_APP_URL
    else process.env.NEXT_PUBLIC_APP_URL = previous
  })

  it('uses NEXT_PUBLIC_APP_URL for absolute redirects and strips a trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://sicpic.netlify.app/'
    const request = new Request('https://internal.example/.netlify/functions/handler')
    expect(appOrigin(request)).toBe('https://sicpic.netlify.app')
  })

  it('falls back to the request origin when the public URL is unset', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    const request = new Request('http://localhost:3000/auth/callback')
    expect(appOrigin(request)).toBe('http://localhost:3000')
  })
})
