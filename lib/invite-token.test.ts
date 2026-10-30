import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  clientAddress,
  createInviteToken,
  hashInviteToken,
  inviteCookieSecure,
  inviteExpiresAt,
  inviteIsUsable,
  inviteUrl,
  INVITE_TTL_MS,
  readCookie,
  resetInviteRateLimit,
  takeRateLimit,
} from '@/lib/invite-token'

describe('invite tokens', () => {
  it('creates a 256-bit token and stores only its hash', () => {
    const created = createInviteToken()
    expect(created.token.length).toBeGreaterThanOrEqual(43)
    expect(created.tokenHash).toBe(hashInviteToken(created.token))
    expect(created.tokenHash).toHaveLength(64)
    expect(created.tokenHash).not.toContain(created.token)
    const short = createInviteToken(Buffer.alloc(16, 7))
    expect(Buffer.from(short.token, 'base64url')).toHaveLength(16)
  })

  it('accepts an open invite and rejects the other states without a short-circuit on the hash', () => {
    const { token, tokenHash } = createInviteToken()
    const now = Date.parse('2026-10-30T12:00:00Z')
    const open = { tokenHash, expiresAt: '2026-11-06T12:00:00Z', revokedAt: null, usedAt: null }
    expect(inviteIsUsable(token, open, now)).toBe(true)
    expect(inviteIsUsable(token, null, now)).toBe(false)
    expect(inviteIsUsable(token, { ...open, revokedAt: '2026-10-30T11:00:00Z' }, now)).toBe(false)
    expect(inviteIsUsable(token, { ...open, usedAt: '2026-10-30T11:00:00Z' }, now)).toBe(false)
    expect(inviteIsUsable(token, { ...open, expiresAt: '2026-10-30T11:00:00Z' }, now)).toBe(false)
    expect(inviteIsUsable(token, { ...open, expiresAt: 'not-a-date' }, now)).toBe(false)
    expect(inviteIsUsable('other-token', open, now)).toBe(false)
    expect(inviteIsUsable(token, { ...open, tokenHash: 'zz' }, now)).toBe(false)
    expect(inviteExpiresAt(now).getTime() - now).toBe(INVITE_TTL_MS)
  })

  it('reads the invite cookie, builds a same-origin url and rate-limits', () => {
    expect(readCookie(null, 'sicpic-invite')).toBeUndefined()
    expect(readCookie('a=1; sicpic-invite=abc%2Fdef; b=2', 'sicpic-invite')).toBe('abc/def')
    expect(readCookie('sicpic-invite=%', 'sicpic-invite')).toBeUndefined()
    expect(readCookie('other=1', 'sicpic-invite')).toBeUndefined()
    expect(inviteUrl('https://sicpic.example/', 'tok')).toBe('https://sicpic.example/einladung/tok')
    expect(inviteCookieSecure('https:')).toBe(true)
    expect(inviteCookieSecure('http:')).toBe(false)
    expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.5, 10.0.0.1' }))).toBe('203.0.113.5')
    expect(clientAddress(new Headers({ 'x-real-ip': '203.0.113.9' }))).toBe('203.0.113.9')
    expect(clientAddress(new Headers())).toBe('local')

    resetInviteRateLimit()
    const start = 1_000
    for (let i = 0; i < 30; i += 1) expect(takeRateLimit('invite:local', start)).toBe(true)
    expect(takeRateLimit('invite:local', start)).toBe(false)
    expect(takeRateLimit('invite:local', start + 10 * 60 * 1000)).toBe(true)
    expect(hashInviteToken('same')).toBe(createHash('sha256').update('same').digest('hex'))
    resetInviteRateLimit()
  })

  it('drops expired rate-limit buckets once the map grows', () => {
    resetInviteRateLimit()
    for (let i = 0; i < 1001; i += 1) takeRateLimit(`old:${i}`, 0, 5, 10)
    expect(takeRateLimit('fresh', 20, 5, 10)).toBe(true)
    resetInviteRateLimit()
  })
})
