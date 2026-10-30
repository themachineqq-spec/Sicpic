import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { linkOrBootstrapMember } from '@/lib/auth'
import { appOrigin } from '@/lib/config'
import { isE2ERequest } from '@/lib/e2e-guard'
import { redeemInviteToken } from '@/lib/invite-service'
import { INVITE_COOKIE, inviteCookieSecure, readCookie } from '@/lib/invite-token'
import { createClient } from '@/lib/supabase/server'

function safeNext(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/auth')) return '/gruppe'
  if (value.includes('\\') || value.includes('://')) return '/gruppe'
  return value
}

function cookieBase(request: Request) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: inviteCookieSecure(new URL(request.url).protocol),
    path: '/',
  }
}

function clearInvite(response: NextResponse, request: Request) {
  response.cookies.set(INVITE_COOKIE, '', { ...cookieBase(request), maxAge: 0 })
  return response
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const origin = appOrigin(request)
  const next = safeNext(url.searchParams.get('next'))
  const failure = new URL('/', origin)
  failure.searchParams.set('fehler', 'anmeldung')

  if (url.searchParams.get('e2e') === '1') {
    if (!(await isE2ERequest())) return NextResponse.redirect(failure)
    return completeE2EInvite(request, origin, next)
  }

  const code = url.searchParams.get('code')
  if (!code) return NextResponse.redirect(failure)

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return NextResponse.redirect(failure)

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(failure)

  try {
    const member = await linkOrBootstrapMember(user)
    const token = readCookie(request.headers.get('cookie'), INVITE_COOKIE)
    if (member) {
      return clearInvite(NextResponse.redirect(new URL(next, origin)), request)
    }
    if (token) {
      const redeemed = await redeemInviteToken(token, user)
      if (redeemed) {
        return clearInvite(NextResponse.redirect(new URL(next, origin)), request)
      }
      await supabase.auth.signOut()
      return clearInvite(NextResponse.redirect(new URL('/einladung/ungueltig', origin)), request)
    }
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/nicht-eingeladen', origin))
  } catch (caught) {
    console.error(caught instanceof Error ? caught.name : 'auth callback failed')
    failure.searchParams.set('fehler', 'config')
    return NextResponse.redirect(failure)
  }
}

async function completeE2EInvite(request: Request, origin: string, next: string) {
  const token = readCookie(request.headers.get('cookie'), INVITE_COOKIE)
  const invalid = clearInvite(NextResponse.redirect(new URL('/einladung/ungueltig', origin)), request)
  const sessionToken = process.env.SICPIC_E2E_TOKEN
  if (!token || !sessionToken) return invalid
  const id = randomUUID()
  const user = {
    id,
    email: `gast-${id.slice(0, 8)}@example.com`,
    user_metadata: { full_name: 'Gast' },
    app_metadata: {},
    aud: 'authenticated',
    created_at: new Date(0).toISOString(),
  } as User
  try {
    const member = await redeemInviteToken(token, user)
    if (!member) return invalid
    const response = clearInvite(NextResponse.redirect(new URL(next, origin)), request)
    const base = cookieBase(request)
    response.cookies.set('sicpic-e2e', sessionToken, { ...base, maxAge: 60 * 60 })
    response.cookies.set('sicpic-e2e-role', member.role === 'admin' ? 'admin' : 'member', { ...base, maxAge: 60 * 60 })
    return response
  } catch (caught) {
    console.error(caught instanceof Error ? caught.name : 'e2e invite failed')
    return invalid
  }
}
