import 'server-only'

import { AppError } from '@/lib/errors'
import { assertEmail } from '@/lib/member'
import { mapMember } from '@/lib/member'
import { deleteR2Objects } from '@/lib/r2'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Member, MemberRole, MemberRow } from '@/lib/types'

export async function listMembers(): Promise<Member[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('members')
    .select('id, user_id, email, display_name, role')
    .order('email', { ascending: true })
  if (error) throw new AppError(500, 'server', 'Mitglieder konnten nicht geladen werden.')
  return ((data ?? []) as MemberRow[]).map(mapMember)
}

export async function addMember(input: { email: string; displayName?: string; role?: MemberRole }) {
  const email = assertEmail(input.email)
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('members')
    .insert({
      email,
      display_name: input.displayName?.trim() || null,
      role: input.role ?? 'member',
      user_id: null,
    })
    .select('id, user_id, email, display_name, role')
    .single()
  if (error) {
    if (error.code === '23505') throw new AppError(409, 'conflict', 'Diese Adresse steht schon auf der Liste.')
    throw new AppError(500, 'server', 'Mitglied konnte nicht eingeladen werden.')
  }
  return mapMember(data as MemberRow)
}

export async function updateMemberRole(id: string, role: MemberRole): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('members').update({ role }).eq('id', id)
  if (error) {
    if (String(error.message).includes('last_admin')) {
      throw new AppError(409, 'last_admin', 'Die letzte Admin-Person kann nicht herabgestuft werden.')
    }
    throw new AppError(500, 'server', 'Die Rolle konnte nicht geändert werden.')
  }
}

export async function removeMember(actor: Member, id: string): Promise<void> {
  if (actor.id === id) {
    throw new AppError(409, 'conflict', 'Du kannst dich nicht selbst entfernen.')
  }
  const admin = createAdminClient()
  const [{ data: photos, error: photoError }, { data: feedback, error: feedbackError }, { data: target, error: targetError }] =
    await Promise.all([
      admin.from('photos').select('original_key, display_key, thumb_key').eq('owner_id', id),
      admin.from('feedback').select('screenshot_key').eq('author_id', id),
      admin.from('members').select('id, role').eq('id', id).maybeSingle(),
    ])
  if (photoError || feedbackError || targetError) {
    throw new AppError(500, 'server', 'Mitglied konnte nicht entfernt werden.')
  }
  if (!target) throw new AppError(404, 'not_found', 'Mitglied nicht gefunden.')

  const keys = [
    ...((photos ?? []) as { original_key: string; display_key: string; thumb_key: string }[]).flatMap((photo) => [
      photo.original_key,
      photo.display_key,
      photo.thumb_key,
    ]),
    ...((feedback ?? []) as { screenshot_key: string | null }[])
      .map((item) => item.screenshot_key)
      .filter((key): key is string => Boolean(key)),
  ]
  await deleteR2Objects(keys)
  const { error } = await admin.from('members').delete().eq('id', id)
  if (error) {
    if (String(error.message).includes('last_admin')) {
      throw new AppError(409, 'last_admin', 'Die letzte Admin-Person kann nicht entfernt werden.')
    }
    throw new AppError(500, 'server', 'Mitglied konnte nicht entfernt werden.')
  }
}
