import 'server-only'

import { AppError } from '@/lib/errors'
import { isE2ERequest } from '@/lib/e2e-guard'
import { setE2EDisplayName } from '@/lib/e2e-store'
import { mapMember } from '@/lib/member'
import { createClient } from '@/lib/supabase/server'
import type { Member, MemberRow } from '@/lib/types'

export async function updateOwnDisplayName(member: Member, displayName: string): Promise<Member> {
  if (await isE2ERequest()) {
    setE2EDisplayName(displayName)
    return { ...member, displayName }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('members')
    .update({ display_name: displayName })
    .eq('id', member.id)
    .select('id, user_id, email, display_name, role')
    .maybeSingle()
  if (error) throw new AppError(500, 'server', 'Der Anzeigename konnte nicht gespeichert werden.')
  if (!data) throw new AppError(403, 'forbidden', 'Du kannst nur deinen eigenen Anzeigenamen ändern.')
  return mapMember(data as MemberRow)
}
