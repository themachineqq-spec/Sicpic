import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const INVITE_COOKIE = 'sicpic-invite'
export const INVITE_COOKIE_MAX_AGE = 15 * 60
const TOKEN_BYTES = 32
const MAX_TOKEN_CHARS = 256

const buckets = new Map<string, { start: number; count: number }>()

export function createInviteToken(bytes = randomBytes(TOKEN_BYTES)): { token: string; tokenHash: string } {
  const token = Buffer.from(bytes).toString('base64url')
  return { token, tokenHash: hashInviteToken(token) }
}

export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token.slice(0, MAX_TOKEN_CHARS)).digest('hex')
}

const ABSENT_HASH = hashInviteToken('sicpic-invite-absent')

export type InviteGate = {
  tokenHash: string
  expiresAt: string
  revokedAt: string | null
  usedAt: string | null
}

export function inviteIsUsable(token: string, row: InviteGate | null, now = Date.now()): boolean {
  const hash = hashInviteToken(token)
  const stored = row && /^[0-9a-f]{64}$/.test(row.tokenHash) ? row.tokenHash : ABSENT_HASH
  const left = Buffer.from(hash, 'hex')
  const right = Buffer.from(stored, 'hex')
  const match = left.length === right.length && timingSafeEqual(left, right)
  if (!row || !match) return false
  if (row.revokedAt || row.usedAt) return false
  const expires = new Date(row.expiresAt).getTime()
  return Number.isFinite(expires) && expires > now
}

export function inviteExpiresAt(now = Date.now()): Date {
  return new Date(now + INVITE_TTL_MS)
}

export function inviteUrl(origin: string, token: string): string {
  const base = origin.replace(/\/$/, '')
  return `${base}/einladung/${token}`
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 0) continue
    const key = part.slice(0, separator).trim()
    if (key !== name) continue
    const value = part.slice(separator + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

export function clientAddress(headers: { get(name: string): string | null }): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const real = headers.get('x-real-ip')?.trim()
  return (forwarded || real || 'local').slice(0, 80)
}

export function takeRateLimit(key: string, now: number, limit = 30, windowMs = 10 * 60 * 1000): boolean {
  if (buckets.size > 1000) {
    for (const [entry, bucket] of buckets) {
      if (now - bucket.start >= windowMs) buckets.delete(entry)
    }
  }
  const bucket = buckets.get(key)
  if (!bucket || now - bucket.start >= windowMs) {
    buckets.set(key, { start: now, count: 1 })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}

export function resetInviteRateLimit(): void {
  buckets.clear()
}

export function inviteCookieSecure(protocol: string): boolean {
  return protocol === 'https:'
}
