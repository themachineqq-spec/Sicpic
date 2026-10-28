import { AppError } from '@/lib/errors'
import type { FeedbackStatus, Member, PhotoRecord } from '@/lib/types'

export function assertMember(member: Member | null): asserts member is Member {
  if (!member) {
    throw new AppError(403, 'forbidden', 'Du bist nicht in der Gruppe.')
  }
}

export function assertAdmin(member: Member | null): asserts member is Member {
  assertMember(member)
  if (member.role !== 'admin') {
    throw new AppError(403, 'forbidden', 'Nur für Admins.')
  }
}

export function assertCanDeletePhoto(member: Member, photo: Pick<PhotoRecord, 'ownerId'>): void {
  if (photo.ownerId !== member.id) {
    throw new AppError(403, 'forbidden', 'Du kannst nur deine eigenen Fotos löschen.')
  }
}

export function assertCanReadGroupPhoto(member: Member | null): asserts member is Member {
  assertMember(member)
}

export function assertCanModerateFeedback(member: Member | null): asserts member is Member {
  assertAdmin(member)
}

export function assertCanManageMembers(member: Member | null): asserts member is Member {
  assertAdmin(member)
}

const STATUSES = new Set<FeedbackStatus>(['neu', 'in_arbeit', 'erledigt'])

export function parseFeedbackStatus(value: string): FeedbackStatus {
  if (STATUSES.has(value as FeedbackStatus)) return value as FeedbackStatus
  throw new AppError(400, 'bad_request', 'Unbekannter Status.')
}
