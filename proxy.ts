import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { buildContentSecurityPolicy } from '@/lib/csp'

// Netlify runs this proxy as an edge function. Keep the AWS SDK out of this
// file. Presigned R2 URLs are issued only from Node route handlers.

const PROTECTED = ['/ordner', '/gruppe', '/feedback', '/verwaltung']

function applyContentSecurityPolicy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV === 'development',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  })

  const continueWith = () => {
    const headers = new Headers(request.headers)
    headers.set('x-nonce', nonce)
    headers.set('Content-Security-Policy', contentSecurityPolicy)
    const response = NextResponse.next({ request: { headers } })
    response.headers.set('Content-Security-Policy', contentSecurityPolicy)
    return response
  }

  return { contentSecurityPolicy, continueWith }
}

export async function proxy(request: NextRequest) {
  const { contentSecurityPolicy, continueWith } = applyContentSecurityPolicy(request)
  let response = continueWith()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return response

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = continueWith()
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options)
        for (const [header, headerValue] of Object.entries(headers)) response.headers.set(header, headerValue)
        response.headers.set('Content-Security-Policy', contentSecurityPolicy)
      },
    },
  })

  const { data } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const needsAuth = PROTECTED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
  if (needsAuth && !data.user) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/'
    redirectUrl.search = ''
    const redirect = NextResponse.redirect(redirectUrl)
    response.cookies.getAll().forEach((cookie) => {
      redirect.cookies.set(cookie)
    })
    redirect.headers.set('Content-Security-Policy', contentSecurityPolicy)
    return redirect
  }
  return response
}

export const config = {
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico|icons/|sw.js|manifest.webmanifest).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
}
