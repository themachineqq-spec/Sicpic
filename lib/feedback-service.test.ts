import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabase = vi.hoisted(() => ({ from: vi.fn() }))
const head = vi.hoisted(() => vi.fn())

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => supabase }))
vi.mock('@/lib/r2', () => ({ headR2Object: head }))

const member = {
  id: '11111111-1111-4111-8111-111111111111',
  userId: '22222222-2222-4222-8222-222222222222',
  email: 'ada@example.com',
  displayName: 'Ada',
  role: 'member' as const,
}

function chain(result: { data?: unknown; error?: unknown }) {
  const payload = { data: result.data ?? null, error: result.error ?? null }
  const builder: Record<string, unknown> = {}
  const self = () => builder
  for (const name of ['select', 'insert', 'update', 'eq', 'order', 'limit']) builder[name] = self
  builder.maybeSingle = async () => payload
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(payload).then(resolve, reject)
  return builder
}

describe('feedback service', () => {
  beforeEach(() => {
    supabase.from.mockReset()
    head.mockReset()
  })

  it('stores feedback and refuses a screenshot that never arrived', async () => {
    const { createFeedback, listFeedback, updateFeedbackStatus } = await import('@/lib/feedback-service')
    supabase.from.mockReturnValue(chain({ error: null }))
    await expect(
      createFeedback({ member, id: '44444444-4444-4444-8444-444444444444', kind: 'bug', title: 'Titel', body: 'Beschreibung' }),
    ).resolves.toEqual({ id: '44444444-4444-4444-8444-444444444444' })
    const { AppError } = await import('@/lib/errors')
    head.mockRejectedValue(new AppError(400, 'incomplete', 'Die Datei ist nicht im Speicher angekommen.'))
    await expect(
      createFeedback({
        member,
        id: '44444444-4444-4444-8444-444444444444',
        kind: 'feature',
        title: 'Wunsch',
        body: 'Mehr Details bitte',
        screenshotContentType: 'image/png',
      }),
    ).rejects.toMatchObject({ status: 400 })
    supabase.from.mockReturnValue(chain({ data: [], error: { message: 'relation secret' } }))
    await expect(listFeedback({ kind: 'bug', status: 'neu' })).rejects.toMatchObject({
      message: 'Rückmeldungen konnten nicht geladen werden.',
    })
    supabase.from.mockReturnValue(chain({ data: [], error: { message: 'only_status' } }))
    await expect(updateFeedbackStatus('44444444-4444-4444-8444-444444444444', 'erledigt')).rejects.toMatchObject({ status: 403 })
  })

  it('maps rows, size limits and missing screenshots', async () => {
    const { createFeedback, listFeedback, getFeedbackScreenshotKey, updateFeedbackStatus } = await import('@/lib/feedback-service')
    const id = '44444444-4444-4444-8444-444444444444'
    head.mockResolvedValue({ byteSize: 20 })
    supabase.from.mockReturnValue(chain({ error: null }))
    await expect(
      createFeedback({ member, id, kind: 'bug', title: 'Titel', body: 'Beschreibung', screenshotContentType: 'image/jpeg' }),
    ).resolves.toEqual({ id })
    head.mockResolvedValue({ byteSize: 9 * 1024 * 1024 })
    await expect(
      createFeedback({ member, id, kind: 'bug', title: 'Titel', body: 'Beschreibung', screenshotContentType: 'image/jpeg' }),
    ).rejects.toMatchObject({ status: 400 })
    supabase.from.mockReturnValue(chain({ error: { message: 'insert secret' } }))
    await expect(createFeedback({ member, id, kind: 'bug', title: 'Titel', body: 'Beschreibung' })).rejects.toMatchObject({ status: 500 })

    supabase.from.mockReturnValue(
      chain({
        data: [
          {
            id,
            author_id: member.id,
            kind: 'feature',
            title: 'Wunsch',
            body: 'Bitte',
            screenshot_key: null,
            status: 'neu',
            created_at: '2024-07-01T00:00:00.000Z',
            updated_at: '2024-07-01T00:00:00.000Z',
            members: [{ display_name: ' ', email: 'ada@example.com' }],
          },
        ],
      }),
    )
    const items = await listFeedback({ kind: 'other', status: 'nope' })
    expect(items[0]?.authorName).toBe('ada')
    expect(items[0]?.hasScreenshot).toBe(false)

    supabase.from.mockReturnValue(chain({ data: { screenshot_key: `feedback/${member.id}/${id}/screenshot.jpg` } }))
    await expect(getFeedbackScreenshotKey(id)).resolves.toContain('screenshot.jpg')
    supabase.from.mockReturnValue(chain({ data: { screenshot_key: null } }))
    await expect(getFeedbackScreenshotKey(id)).resolves.toBeNull()
    supabase.from.mockReturnValue(chain({ data: null, error: { message: 'secret' } }))
    await expect(getFeedbackScreenshotKey(id)).rejects.toMatchObject({ status: 500 })
    supabase.from.mockReturnValue(chain({ data: null }))
    await expect(getFeedbackScreenshotKey(id)).rejects.toMatchObject({ status: 404 })

    supabase.from.mockReturnValue(chain({ data: [{ id }], error: null }))
    await expect(updateFeedbackStatus(id, 'neu')).resolves.toBeUndefined()
    supabase.from.mockReturnValue(chain({ data: [], error: { message: 'other secret' } }))
    await expect(updateFeedbackStatus(id, 'neu')).rejects.toMatchObject({ status: 500 })
    supabase.from.mockReturnValue(chain({ data: [] }))
    await expect(updateFeedbackStatus(id, 'neu')).rejects.toMatchObject({ status: 404 })
  })
})
