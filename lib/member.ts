import { AppError } from '@/lib/errors'
import type { Member, MemberRow } from '@/lib/types'

export function mapMember(row: MemberRow): Member {
  const email = row.email.trim().toLowerCase()
  const displayName = row.display_name?.trim() || email.split('@')[0] || email
  return {
    id: row.id,
    userId: row.user_id,
    email,
    displayName,
    role: row.role === 'admin' ? 'admin' : 'member',
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function assertEmail(email: string): string {
  const normalized = normalizeEmail(email)
  if (!EMAIL_PATTERN.test(normalized) || normalized.length > 320) {
    throw new AppError(400, 'bad_request', 'Ungültige E-Mail-Adresse.')
  }
  return normalized
}
