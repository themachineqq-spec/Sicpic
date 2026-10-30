import 'server-only'

import type { User } from '@supabase/supabase-js'
import { displayNameFromGoogle } from '@/lib/display-name'
import { AppError } from '@/lib/errors'
import { isE2ERequest } from '@/lib/e2e-guard'
import {
  createE2EInvite,
  listE2EInvites,
  listE2EMembers,
  peekE2EInvite,
  redeemE2EInvite,
  revokeE2EInvite,
} from '@/lib/e2e-store'
import {
  clientAddress,
  createInviteToken,
  hashInviteToken,
  inviteExpiresAt,
  inviteIsUsable,
  inviteUrl,
  takeRateLimit,
  type InviteGate,
} from '@/lib/invite-token'
import { listMembers } from '@/lib/member-admin'
import { mapMember } from '@/lib/member'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Member, MemberRole, MemberRow, OpenInvite } from '@/lib/types'

export type { OpenInvite }
export type CreatedInvite = OpenInvite & { url: string }

type InviteRow = {
  id: string
  display_name: string | null
  role: string
  created_at: string
  expires_at: string
}

function mapInvite(row: InviteRow): OpenInvite {
  return {
    id: row.id,
    displayName: row.display_name?.trim() || null,
    role: row.role === 'admin' ? 'admin' : 'member',
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}

function gateFromRow(row: {
  token_hash: string
  expires_at: string
  revoked_at: string | null
  used_at: string | null
}): InviteGate {
  return {
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    usedAt: row.used_at,
  }
}

export async function listOpenInvites(): Promise<OpenInvite[]> {
  if (await isE2ERequest()) return listE2EInvites()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invites')
    .select('id, display_name, role, created_at, expires_at')
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  if (error) throw new AppError(500, 'server', 'Einladungen konnten nicht geladen werden.')
  return ((data ?? []) as InviteRow[]).map(mapInvite)
}

export async function createInviteLink(
  actor: Member,
  origin: string,
  input: { displayName?: string; role?: MemberRole },
): Promise<CreatedInvite> {
  const displayName = input.displayName?.trim() || null
  const role = input.role === 'admin' ? 'admin' : 'member'
  if (await isE2ERequest()) {
    const created = createE2EInvite({ createdBy: actor.id, displayName, role })
    return {
      id: created.id,
      displayName: created.displayName,
      role: created.role,
      createdAt: new Date().toISOString(),
      expiresAt: created.expiresAt,
      url: inviteUrl(origin, created.token),
    }
  }
  const { token, tokenHash } = createInviteToken()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invites')
    .insert({
      token_hash: tokenHash,
      display_name: displayName,
      role,
      created_by: actor.id,
      expires_at: inviteExpiresAt().toISOString(),
    })
    .select('id, display_name, role, created_at, expires_at')
    .single()
  if (error || !data) throw new AppError(500, 'server', 'Der Einladungslink konnte nicht erstellt werden.')
  return { ...mapInvite(data as InviteRow), url: inviteUrl(origin, token) }
}

export async function revokeInvite(id: string): Promise<void> {
  if (await isE2ERequest()) {
    if (!revokeE2EInvite(id)) throw new AppError(404, 'not_found', 'Einladung nicht gefunden.')
    return
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('invites')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('used_at', null)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()
  if (error) throw new AppError(500, 'server', 'Die Einladung konnte nicht zurückgezogen werden.')
  if (!data) throw new AppError(404, 'not_found', 'Einladung nicht gefunden.')
}

export async function inviteIsOpen(token: string, now = Date.now()): Promise<boolean> {
  if (await isE2ERequest()) return peekE2EInvite(token, now)
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('invites')
    .select('token_hash, expires_at, revoked_at, used_at')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle()
  if (error) {
    console.error('invite lookup failed', { code: error.code })
    throw new AppError(500, 'server', 'Die Einladung konnte nicht geprüft werden.')
  }
  return inviteIsUsable(
    token,
    data
      ? gateFromRow(data as { token_hash: string; expires_at: string; revoked_at: string | null; used_at: string | null })
      : null,
    now,
  )
}

export async function redeemInviteToken(token: string, user: User): Promise<Member | null> {
  const email = user.email?.trim().toLowerCase()
  if (!email) return null
  const metadata = user.user_metadata ?? {}
  const displayName = displayNameFromGoogle(metadata.full_name ?? metadata.name, email)
  if (await isE2ERequest()) {
    return redeemE2EInvite(token, { id: user.id, email, displayName })
  }
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('redeem_invite', {
    p_token_hash: hashInviteToken(token),
    p_user_id: user.id,
    p_email: email,
    p_display_name: displayName.slice(0, 80),
  })
  if (error) {
    console.error('invite redeem failed', { code: error.code })
    throw new AppError(500, 'server', 'Die Einladung konnte nicht eingelöst werden.')
  }
  const row = (Array.isArray(data) ? data[0] : data) as MemberRow | null
  return row ? mapMember(row) : null
}

export function allowInviteAttempt(headerStore: { get(name: string): string | null }): boolean {
  return takeRateLimit(`invite:${clientAddress(headerStore)}`, Date.now())
}

export async function listMembersForPage(): Promise<Member[]> {
  if (await isE2ERequest()) return listE2EMembers()
  return listMembers()
}
