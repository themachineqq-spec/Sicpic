import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import pg from 'pg'

const rows = Number(process.env.PERF_ROWS ?? 20000)
const samples = Number(process.env.PERF_SAMPLES ?? 40)
const budgetMs = Number(process.env.PERF_P95_MS ?? 80)
const databaseUrl = process.env.DATABASE_URL ?? 'postgres://sicpic:sicpic@127.0.0.1:5432/sicpic_perf'
const memberId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function p95(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[Math.max(0, index)]
}

const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
await client.query('drop schema if exists public cascade')
await client.query('drop schema if exists auth cascade')
await client.query('create schema public')
await client.query('create schema auth')
await client.query('create table auth.users (id uuid primary key)')
await client.query(`
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$
`)
await client.query(`
  create function auth.role() returns text language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
  $$
`)
await client.query(`
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated noinherit nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon noinherit nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role noinherit nologin bypassrls; end if;
  end $$
`)
await client.query('grant anon, authenticated, service_role to current_user')
const migrations = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).sort()
for (const name of migrations) {
  await client.query(readFileSync(join('supabase/migrations', name), 'utf8'))
}
await client.query('grant usage on schema public to authenticated, service_role')
await client.query('insert into auth.users (id) values ($1)', [userId])
await client.query(
  `insert into public.members (id, user_id, email, display_name, role) values ($1,$2,'ada@example.com','Ada','admin')`,
  [memberId, userId],
)
console.log(`seeding ${rows} photos`)
await client.query(
  `insert into public.photos (id, owner_id, original_key, display_key, thumb_key, filename, content_type, byte_size, width, height, captured_at)
   select id, $1::uuid,
     'members/' || $1::text || '/photos/' || id::text || '/original.jpg',
     'members/' || $1::text || '/photos/' || id::text || '/display.jpg',
     'members/' || $1::text || '/photos/' || id::text || '/thumb.jpg',
     'foto.jpg', 'image/jpeg', 1000, 320, 240,
     timestamp '2020-01-01' + (random() * interval '2000 days')
   from (select gen_random_uuid() as id from generate_series(1, $2::int)) ids`,
  [memberId, rows],
)
await client.query('analyze public.photos')

await client.query('begin')
await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId])
await client.query(`select set_config('request.jwt.claim.role', 'authenticated', true)`)
await client.query('set local role authenticated')

const times = []
for (let i = 0; i < samples + 5; i += 1) {
  const start = performance.now()
  await client.query(`select id from public.list_photos('group', null, null, 24, 'all')`)
  const elapsed = performance.now() - start
  if (i >= 5) times.push(elapsed)
}
const page = p95(times)
console.log(`sql_p95_ms ${page.toFixed(2)} samples ${times.length} rows ${rows}`)

const s3 = new S3Client({
  region: 'auto',
  endpoint: 'https://example.r2.cloudflarestorage.com',
  credentials: { accessKeyId: 'key', secretAccessKey: 'secret' },
  forcePathStyle: true,
})
async function timeSigns(count) {
  const values = []
  for (let i = 0; i < samples; i += 1) {
    const start = performance.now()
    await Promise.all(
      Array.from({ length: count }, (_, index) =>
        getSignedUrl(s3, new GetObjectCommand({ Bucket: 'sicpic', Key: `members/a/thumb-${index}.webp` }), { expiresIn: 600 }),
      ),
    )
    values.push(performance.now() - start)
  }
  return p95(values)
}
const sign24 = await timeSigns(24)
const sign48 = await timeSigns(48)
console.log(`sign24_p95_ms ${sign24.toFixed(2)}`)
console.log(`sign48_p95_ms ${sign48.toFixed(2)}`)
const api = page + sign48
console.log(`api_page_p95_ms ${api.toFixed(2)} budget ${budgetMs}`)
await client.query('rollback')
await client.end()
if (api > budgetMs) {
  console.error(`perf budget exceeded: ${api.toFixed(2)} > ${budgetMs}`)
  process.exit(1)
}
