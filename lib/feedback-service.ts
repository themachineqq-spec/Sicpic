import 'server-only'

import { resolveScreenshotType } from '@/lib/content-types'
import { AppError } from '@/lib/errors'
import { feedbackScreenshotKey, LIMITS } from '@/lib/keys'
import { headR2Object } from '@/lib/r2'
import { createClient } from '@/lib/supabase/server'
import type { FeedbackItem, FeedbackKind, FeedbackStatus, Member } from '@/lib/types'

type FeedbackRow = {
  id: string
  author_id: string
  kind: FeedbackKind
  title: string
  body: string
  screenshot_key: string | null
  status: FeedbackStatus
  created_at: string
  updated_at: string
  members?: { display_name: string | null; email: string } | { display_name: string | null; email: string }[] | null
}

function authorName(row: FeedbackRow): string {
  const member = Array.isArray(row.members) ? row.members[0] : row.members
  return member?.display_name?.trim() || member?.email.split('@')[0] || 'Unbekannt'
}

function mapFeedback(row: FeedbackRow): FeedbackItem {
  return {
    id: row.id,
    authorId: row.author_id,
    authorName: authorName(row),
    kind: row.kind,
    title: row.title,
    body: row.body,
    status: row.status,
    hasScreenshot: Boolean(row.screenshot_key),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function createFeedback(input: {
  member: Member
  id: string
  kind: FeedbackKind
  title: string
  body: string
  screenshotContentType?: string | null
}) {
  let screenshotKey: string | null = null
  if (input.screenshotContentType) {
    const file = resolveScreenshotType(input.screenshotContentType)
    screenshotKey = feedbackScreenshotKey(input.member.id, input.id, file.extension)
    const head = await headR2Object(screenshotKey)
    if (head.byteSize < 1 || head.byteSize > LIMITS.screenshotBytes) {
      throw new AppError(400, 'bad_request', 'Der Screenshot ist zu groß oder leer.')
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('feedback').insert({
    id: input.id,
    author_id: input.member.id,
    kind: input.kind,
    title: input.title,
    body: input.body,
    screenshot_key: screenshotKey,
    status: 'neu',
  })
  if (error) throw new AppError(500, 'server', 'Die Rückmeldung konnte nicht gespeichert werden.')
  return { id: input.id }
}

export async function listFeedback(filters: { kind?: string | null; status?: string | null }): Promise<FeedbackItem[]> {
  const supabase = await createClient()
  let query = supabase
    .from('feedback')
    .select('id, author_id, kind, title, body, screenshot_key, status, created_at, updated_at, members(display_name, email)')
    .order('created_at', { ascending: false })
    .limit(200)
  if (filters.kind === 'bug' || filters.kind === 'feature') query = query.eq('kind', filters.kind)
  if (filters.status === 'neu' || filters.status === 'in_arbeit' || filters.status === 'erledigt') {
    query = query.eq('status', filters.status)
  }
  const { data, error } = await query
  if (error) throw new AppError(500, 'server', 'Rückmeldungen konnten nicht geladen werden.')
  return ((data ?? []) as FeedbackRow[]).map(mapFeedback)
}

export async function getFeedbackScreenshotKey(id: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('feedback').select('screenshot_key').eq('id', id).maybeSingle()
  if (error) throw new AppError(500, 'server', 'Screenshot konnte nicht geladen werden.')
  if (!data) throw new AppError(404, 'not_found', 'Rückmeldung nicht gefunden.')
  return (data.screenshot_key as string | null) ?? null
}

export async function updateFeedbackStatus(id: string, status: FeedbackStatus): Promise<void> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('feedback').update({ status }).eq('id', id).select('id')
  if (error) {
    if (String(error.message).includes('only_status') || String(error.message).includes('forbidden')) {
      throw new AppError(403, 'forbidden', 'Der Status konnte nicht geändert werden.')
    }
    throw new AppError(500, 'server', 'Der Status konnte nicht gespeichert werden.')
  }
  if (!data?.length) throw new AppError(404, 'not_found', 'Rückmeldung nicht gefunden.')
}
