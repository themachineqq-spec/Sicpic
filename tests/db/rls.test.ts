import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const databaseUrl = process.env.DATABASE_URL ?? 'postgres://sicpic:sicpic@127.0.0.1:5432/sicpic_test'
const adminA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const userA = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const adminB = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const userB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const photoA = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const photoB = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const feedbackA = '99999999-9999-4999-8999-999999999999'

let available = false

async function admin() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  return client
}

async function captureError(client: Client, sql: string, params: unknown[] = []): Promise<string> {
  await client.query('savepoint spec')
  try {
    await client.query(sql, params)
    await client.query('release savepoint spec')
    return ''
  } catch (error) {
    await client.query('rollback to savepoint spec')
    return error instanceof Error ? error.message : ''
  }
}

async function withRole<T>(userId: string | null, jwtRole: 'authenticated' | 'anon' | 'service_role', fn: (client: Client) => Promise<T>) {
  const client = await admin()
  try {
    await client.query('begin')
    await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ''])
    await client.query(`select set_config('request.jwt.claim.role', $1, true)`, [jwtRole])
    await client.query(`set local role ${jwtRole}`)
    await client.query(`set local search_path to public, auth`)
    const result = await fn(client)
    await client.query('rollback')
    return result
  } finally {
    await client.end()
  }
}

describe('postgres RLS migration', () => {
  beforeAll(async () => {
    const client = await admin()
    available = true
    await client.query('drop schema if exists public cascade')
    await client.query('drop schema if exists auth cascade')
    await client.query('create schema public')
    await client.query('create schema auth')
    await client.query('create table auth.users (id uuid primary key)')
    await client.query(`
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$
    `)
    await client.query(`
      create or replace function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claim.role', true), '')
      $$
    `)
    await client.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon noinherit nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated noinherit nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role noinherit nologin bypassrls; end if;
      end $$
    `)
    await client.query('grant anon, authenticated, service_role to current_user')
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/20261028120000_init.sql'), 'utf8')
    await client.query(sql)
    const videoSql = readFileSync(join(process.cwd(), 'supabase/migrations/20261030140000_video_media.sql'), 'utf8')
    await client.query(videoSql)
    await client.query('grant usage on schema public to anon, authenticated, service_role')
    await client.query(`insert into auth.users (id) values ($1), ($2)`, [userA, userB])
    await client.query(
      `insert into public.members (id, user_id, email, display_name, role) values
        ($1, $2, 'ada@example.com', 'Ada', 'admin'),
        ($3, $4, 'bea@example.com', 'Bea', 'member')`,
      [adminA, userA, adminB, userB],
    )
    const key = (owner: string, photo: string) => ({
      original: `members/${owner}/photos/${photo}/original.jpg`,
      display: `members/${owner}/photos/${photo}/display.jpg`,
      thumb: `members/${owner}/photos/${photo}/thumb.jpg`,
    })
    const a = key(adminA, photoA)
    const b = key(adminB, photoB)
    await client.query(
      `insert into public.photos (id, owner_id, original_key, display_key, thumb_key, filename, content_type, byte_size, width, height, captured_at)
       values ($1,$2,$3,$4,$5,'a.jpg','image/jpeg',10,1,1,'2020-01-01T00:00:00Z'),
              ($6,$7,$8,$9,$10,'b.jpg','image/jpeg',10,1,1,'2024-01-01T00:00:00Z')`,
      [photoA, adminA, a.original, a.display, a.thumb, photoB, adminB, b.original, b.display, b.thumb],
    )
    await client.query(
      `insert into public.feedback (id, author_id, kind, title, body, status) values ($1,$2,'bug','Titel','Beschreibung der Sache','neu')`,
      [feedbackA, adminA],
    )
    await client.end()
  })

  afterAll(async () => {
    if (!available) return
  })

  it('lets group members read the shared timeline and blocks strangers', async () => {
    const seen = await withRole(userB, 'authenticated', async (client) => {
      const photos = await client.query('select id from public.photos order by captured_at desc')
      const ownDelete = await client.query('delete from public.photos where id = $1', [photoA])
      return { ids: photos.rows.map((row) => row.id), deleted: ownDelete.rowCount }
    })
    expect(seen.ids).toEqual([photoB, photoA])
    expect(seen.deleted).toBe(0)
    const stranger = await withRole('12121212-1212-4121-8121-121212121212', 'authenticated', async (client) => {
      const photos = await client.query('select id from public.photos')
      return photos.rows.length
    })
    expect(stranger).toBe(0)
  })

  it('orders list_photos newest capture first and keeps private deletes to the owner', async () => {
    const ordered = await withRole(userA, 'authenticated', async (client) => {
      const rows = await client.query(`select id from public.list_photos('group', null, null, 10)`)
      const removed = await client.query('delete from public.photos where owner_id = $1 returning id', [adminA])
      return { ids: rows.rows.map((row) => row.id), removed: removed.rows.map((row) => row.id) }
    })
    expect(ordered.ids).toEqual([photoB, photoA])
    expect(ordered.removed).toEqual([photoA])
  })

  it('lists a video with the photos and lets only the owner delete it', async () => {
    const videoId = '12121212-1212-4121-8121-121212121212'
    const client = await admin()
    try {
      await client.query('begin')
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userA])
      await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`)
      await client.query('set local role authenticated')
      await client.query(
        `insert into public.photos (id, owner_id, original_key, display_key, thumb_key, filename, content_type, byte_size, width, height, captured_at, media_type, duration_ms, codec)
         values ($1,$2,$3,null,null,'clip.mov','video/quicktime',20,1920,1080,'2024-08-01T00:00:00Z','video',4000,'hevc')`,
        [videoId, adminA, `members/${adminA}/photos/${videoId}/original.mov`],
      )
      const onlyVideo = await client.query(`select id, duration_ms from public.list_photos('group', null, null, 10, 'video')`)
      const onlyPhoto = await client.query(`select id from public.list_photos('mine', null, null, 10, 'photo')`)
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userB])
      const removed = await client.query('delete from public.photos where id = $1', [videoId])
      await client.query('rollback')
      expect(onlyVideo.rows.map((row) => row.id)).toEqual([videoId])
      expect(Number(onlyVideo.rows[0]?.duration_ms)).toBe(4000)
      expect(onlyPhoto.rows.map((row) => row.id)).toEqual([photoA])
      expect(removed.rowCount).toBe(0)
    } finally {
      await client.end()
    }
  })

  it('keeps private folders, feedback and member edits inside their policies', async () => {
    const mine = await withRole(userB, 'authenticated', async (client) => {
      const own = await client.query(`select id from public.list_photos('mine', null, null, 10)`)
      const older = await client.query(`select id from public.list_photos('group', '2024-01-01T00:00:00Z', $1, 10)`, [photoB])
      const foreignFeedback = await client.query('select id from public.feedback')
      const feedbackUpdate = await client.query('update public.feedback set status = $1 where id = $2', ['erledigt', feedbackA])
      const photoUpdate = await captureError(client, `update public.photos set filename = 'fremd.jpg' where id = $1`, [photoA])
      return {
        own: own.rows.map((row) => row.id),
        older: older.rows.map((row) => row.id),
        feedback: foreignFeedback.rows.length,
        feedbackUpdated: feedbackUpdate.rowCount,
        photoUpdate,
      }
    })
    expect(mine.own).toEqual([photoB])
    expect(mine.older).toEqual([photoA])
    expect(mine.feedback).toBe(0)
    expect(mine.feedbackUpdated).toBe(0)
    expect(mine.photoUpdate).toMatch(/permission denied/)

    const guarded = await withRole(userA, 'authenticated', async (client) => {
      await client.query(`update public.feedback set status = 'in_arbeit' where id = $1`, [feedbackA])
      const locked = await captureError(client, 'update public.members set user_id = null where id = $1', [adminB])
      await client.query(`update public.members set email = 'Bea@Example.com', display_name = 'Beate' where id = $1`, [adminB])
      const renamed = await client.query('select email, display_name from public.members where id = $1', [adminB])
      return { locked, email: renamed.rows[0]?.email, name: renamed.rows[0]?.display_name }
    })
    expect(guarded.locked).toMatch(/user_link_locked/)
    expect(guarded.email).toBe('bea@example.com')
    expect(guarded.name).toBe('Beate')

    await expect(
      withRole(null, 'anon', async (client) => {
        await client.query('select id from public.photos')
      }),
    ).rejects.toThrow(/permission denied/)
    await expect(
      withRole(userA, 'authenticated', async (client) => {
        await client.query(`select public.claim_initial_admin('ada@example.com', $1, 'Ada')`, [userA])
      }),
    ).rejects.toThrow(/permission denied/)
  })

  it('guards the last admin, feedback edits and the one-time admin claim', async () => {
    const adminUpdate = await withRole(userA, 'authenticated', async (client) => {
      const title = await captureError(client, `update public.feedback set title = 'anders' where id = $1`, [feedbackA])
      const demote = await captureError(client, `update public.members set role = 'member' where id = $1`, [adminA])
      return { title, demote }
    })
    expect(adminUpdate.title).toMatch(/only_status/)
    expect(adminUpdate.demote).toMatch(/last_admin/)

    const blocked = await withRole(null, 'service_role', async (client) => {
      const row = await client.query(
        `select id::text from public.claim_initial_admin('other@example.com', $1, 'Other')`,
        [userB],
      )
      return row.rows[0]?.id ?? null
    })
    expect(blocked).toBeNull()

    const client = await admin()
    try {
      await client.query('begin')
      await client.query('alter table public.members disable trigger members_protect_last_admin')
      await client.query('delete from public.photos')
      await client.query('delete from public.feedback')
      await client.query('delete from public.members')
      await client.query('alter table public.members enable trigger members_protect_last_admin')
      await client.query(`select set_config('request.jwt.claim.role', 'service_role', true)`)
      await client.query('set local role service_role')
      const first = await client.query(
        `select id::text from public.claim_initial_admin('ada@example.com', $1, 'Ada')`,
        [userA],
      )
      const second = await client.query(
        `select id::text from public.claim_initial_admin('other@example.com', $1, 'Other')`,
        [userB],
      )
      const same = await client.query(
        `select id::text from public.claim_initial_admin('ada@example.com', $1, 'Ada')`,
        [userA],
      )
      const admins = await client.query(`select count(*)::int as count from public.members where role = 'admin'`)
      await client.query('rollback')
      expect(first.rows[0]?.id).toBeTruthy()
      expect(second.rows[0]?.id ?? null).toBeNull()
      expect(same.rows[0]?.id).toBe(first.rows[0]?.id)
      expect(admins.rows[0]?.count).toBe(1)
    } finally {
      await client.end()
    }
  })
})
