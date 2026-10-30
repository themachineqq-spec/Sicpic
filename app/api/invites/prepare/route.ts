import { NextResponse } from 'next/server'
import { errorResponse, json, readJson } from '@/lib/http'
import { inviteIsOpen } from '@/lib/invite-service'
import {
  INVITE_COOKIE,
  INVITE_COOKIE_MAX_AGE,
  clientAddress,
  inviteCookieSecure,
  takeRateLimit,
} from '@/lib/invite-token'
import { AppError } from '@/lib/errors'

const INVALID = 'Diese Einladung ist nicht gültig.'

export async function POST(request: Request) {
  try {
    const address = clientAddress(request.headers)
    if (!takeRateLimit(`invite:${address}`, Date.now())) {
      throw new AppError(429, 'rate_limited', 'Zu viele Versuche. Bitte warte einen Moment.')
    }
    const body = await readJson(request)
    const token = body && typeof body === 'object' && 'token' in body && typeof body.token === 'string' ? body.token.slice(0, 256) : ''
    const open = await inviteIsOpen(token)
    if (!open) return json({ error: 'invalid', message: INVALID }, 400)
    const response = NextResponse.json(
      { ok: true },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
    )
    response.cookies.set(INVITE_COOKIE, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: inviteCookieSecure(new URL(request.url).protocol),
      path: '/',
      maxAge: INVITE_COOKIE_MAX_AGE,
    })
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
