import { describe, expect, it } from 'vitest'
import { AppError } from '@/lib/errors'
import {
  assertAdmin,
  assertCanDeletePhoto,
  assertCanManageMembers,
  assertCanModerateFeedback,
  assertMember,
  parseFeedbackStatus,
} from '@/lib/permissions'
import type { Member } from '@/lib/types'

const member: Member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member',
}

const admin: Member = { ...member, id: '33333333-3333-4333-8333-333333333333', role: 'admin' }

describe('permission checks', () => {
  it('rejects guests and accepts members', () => {
    expect(() => assertMember(null)).toThrow(AppError)
    expect(() => assertMember(member)).not.toThrow()
  })

  it('lets a member delete only their own photo', () => {
    expect(() => assertCanDeletePhoto(member, { ownerId: member.id })).not.toThrow()
    expect(() => assertCanDeletePhoto(member, { ownerId: admin.id })).toThrow(/eigenen Fotos/)
  })

  it('reserves member management and feedback moderation for admins', () => {
    expect(() => assertCanManageMembers(member)).toThrow(AppError)
    expect(() => assertCanModerateFeedback(member)).toThrow(AppError)
    expect(() => assertAdmin(null)).toThrow(AppError)
    expect(() => assertCanManageMembers(admin)).not.toThrow()
    expect(() => assertCanModerateFeedback(admin)).not.toThrow()
  })

  it('accepts only the three feedback statuses', () => {
    expect(parseFeedbackStatus('neu')).toBe('neu')
    expect(parseFeedbackStatus('in_arbeit')).toBe('in_arbeit')
    expect(parseFeedbackStatus('erledigt')).toBe('erledigt')
    expect(() => parseFeedbackStatus('closed')).toThrow(AppError)
  })
})
