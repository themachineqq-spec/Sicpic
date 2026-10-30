import 'server-only'

import { cache } from 'react'
import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { AppError } from '@/lib/errors'
import { mapMember } from '@/lib/member'
import type { AccessDeps } from '@/lib/photo-access'
import { e2eAccessOverride } from '@/lib/e2e-guard'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Member, MemberRow } from '@/lib/types'

function displayNameFromUser(user: User, email: string): string {
  const metadata = user.user_metadata ?? {}
  const raw = metadata.full_name ?? metadata.name
  const name = typeof raw === 'string' ? raw.trim() : ''
  return (name || email.split('@')[0] || email).slice(0, 80)
}

async function loadRequestAccess(): Promise<{
  session: { userId: string } | null
  member: Member | null
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { session: null, member: null }

  const { data, error } = await supabase
    .from('members')
    .select('id, user_id, email, display_name, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) throw new AppError(500, 'server', 'Mitgliedschaft konnte nicht geladen werden.')
  return {
    session: { userId: user.id },
    member: data ? mapMember(data as MemberRow) : null,
  }
}

const loadCachedRequestAccess = cache(loadRequestAccess)

export async function getRequestAccess() {
  const override = await e2eAccessOverride()
  if (override) return override
  return loadCachedRequestAccess()
}

export function createRequestAccess(): Pick<AccessDeps, 'getSession' | 'getMember'> {
  const access = getRequestAccess()
  return {
    getSession: async () => (await access).session,
    getMember: async () => (await access).member,
  }
}

export async function requirePageMember(): Promise<Member> {
  const access = await getRequestAccess()
  if (!access.session) redirect('/')
  if (!access.member) redirect('/nicht-eingeladen')
  return access.member
}

export async function linkOrBootstrapMember(user: User): Promise<Member | null> {
  const email = user.email?.trim().toLowerCase()
  if (!email) return null
  const admin = createAdminClient()
  const { data: existing, error } = await admin
    .from('members')
    .select('id, user_id, email, display_name, role')
    .eq('email', email)
    .maybeSingle()
  if (error) throw new AppError(500, 'server', 'Mitgliedschaft konnte nicht geprüft werden.')

  const displayName = displayNameFromUser(user, email)
  if (existing) {
    const row = existing as MemberRow
    if (row.user_id && row.user_id !== user.id) return null
    if (!row.user_id || !row.display_name) {
      const patch: Partial<MemberRow> = {}
      if (!row.user_id) patch.user_id = user.id
      if (!row.display_name) patch.display_name = displayName
      const { error: updateError } = await admin.from('members').update(patch).eq('id', row.id)
      if (updateError) throw new AppError(500, 'server', 'Mitgliedschaft konnte nicht verknüpft werden.')
      return mapMember({ ...row, ...patch })
    }
    return mapMember(row)
  }

  const initial = process.env.INITIAL_ADMIN_EMAIL?.trim().toLowerCase()
  if (!initial || email !== initial) return null

  const { data, error: claimError } = await admin.rpc('claim_initial_admin', {
    p_email: email,
    p_user_id: user.id,
    p_display_name: displayName,
  })
  if (claimError) throw new AppError(500, 'server', 'Das Admin-Konto konnte nicht angelegt werden.')
  const row = (Array.isArray(data) ? data[0] : data) as MemberRow | null
  return row ? mapMember(row) : null
}
