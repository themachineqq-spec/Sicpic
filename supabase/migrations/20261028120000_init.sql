-- Sicpic: Mitglieder-Allowlist, Fotometadaten, Rückmeldungen.
-- Dateien liegen nicht in Postgres, sondern privat in Cloudflare R2.
-- Die Tabellenowner-Rolle umgeht RLS (Supabase-Standard). service_role
-- ebenfalls. Angemeldete Konten unterliegen den Policies. FORCE ROW LEVEL
-- SECURITY ist absichtlich aus, damit Fremdschlüssel-Cascades beim Entfernen
-- eines Mitglieds nicht an den Foto-Policies hängen bleiben. Die App löscht
-- Speicherobjekte zusätzlich über die Service-Role.

create extension if not exists pgcrypto;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  email text not null unique,
  display_name text,
  role text not null default 'member',
  created_at timestamptz not null default now(),
  created_by uuid,
  constraint members_email_lower check (email = lower(email)),
  constraint members_email_shape check (position('@' in email) > 1),
  constraint members_role check (role in ('admin', 'member')),
  constraint members_display_name_len check (display_name is null or char_length(display_name) <= 80)
);

create table public.photos (
  id uuid primary key,
  owner_id uuid not null references public.members (id) on delete cascade,
  original_key text not null,
  display_key text not null,
  thumb_key text not null,
  filename text not null,
  content_type text not null,
  byte_size bigint not null,
  width integer,
  height integer,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint photos_filename_len check (char_length(filename) between 1 and 180),
  constraint photos_byte_size check (byte_size > 0 and byte_size <= 52428800),
  constraint photos_dimensions check (
    (width is null or width > 0) and (height is null or height > 0)
  ),
  constraint photos_content_type check (
    content_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif')
  ),
  constraint photos_keys_owned check (
    original_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/original\.(jpg|png|heic|heif)$')
    and display_key = 'members/' || owner_id::text || '/photos/' || id::text || '/display.jpg'
    and thumb_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb.jpg'
    and original_key !~ '\.\.'
  )
);

create index photos_timeline_idx on public.photos (captured_at desc, id desc);
create index photos_owner_timeline_idx on public.photos (owner_id, captured_at desc, id desc);

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.members (id) on delete cascade,
  kind text not null,
  title text not null,
  body text not null,
  screenshot_key text,
  status text not null default 'neu',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint feedback_kind check (kind in ('bug', 'feature')),
  constraint feedback_status check (status in ('neu', 'in_arbeit', 'erledigt')),
  constraint feedback_title_len check (char_length(title) between 3 and 120),
  constraint feedback_body_len check (char_length(body) between 5 and 4000),
  constraint feedback_screenshot_key check (
    screenshot_key is null
    or screenshot_key ~ ('^feedback/' || author_id::text || '/' || id::text || '/screenshot\.(jpg|png|webp)$')
  )
);

create index feedback_created_idx on public.feedback (created_at desc);
create index feedback_status_idx on public.feedback (status, kind);

create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select m.id
  from public.members m
  where m.user_id = auth.uid()
  limit 1
$$;

create or replace function public.is_group_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_member_id() is not null
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.role = 'admin'
  )
$$;

alter table public.members enable row level security;
alter table public.photos enable row level security;
alter table public.feedback enable row level security;

revoke all on public.members from public, anon;
revoke all on public.photos from public, anon;
revoke all on public.feedback from public, anon;

grant select, insert, update, delete on public.members to authenticated;
grant select, insert, delete on public.photos to authenticated;
grant select, insert, update on public.feedback to authenticated;

-- service_role umgeht RLS, braucht aber eigene Tabellenrechte. Ohne diese
-- Grants kann der Server weder die erste Admin-Person verknüpfen noch die
-- Objekte eines Mitglieds beim Entfernen lesen.
grant select, insert, update, delete on public.members to service_role;
grant select, insert, update, delete on public.photos to service_role;
grant select, insert, update, delete on public.feedback to service_role;

create policy members_select_group on public.members
  for select to authenticated
  using (public.is_group_member());

create policy members_insert_admin on public.members
  for insert to authenticated
  with check (public.is_admin() and user_id is null);

create policy members_update_admin on public.members
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy members_delete_admin on public.members
  for delete to authenticated
  using (public.is_admin());

create policy photos_select_group on public.photos
  for select to authenticated
  using (public.is_group_member());

create policy photos_insert_own on public.photos
  for insert to authenticated
  with check (owner_id = public.current_member_id());

create policy photos_delete_own on public.photos
  for delete to authenticated
  using (owner_id = public.current_member_id());

create policy feedback_select_own_or_admin on public.feedback
  for select to authenticated
  using (author_id = public.current_member_id() or public.is_admin());

create policy feedback_insert_own on public.feedback
  for insert to authenticated
  with check (author_id = public.current_member_id() and status = 'neu');

create policy feedback_update_admin on public.feedback
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.protect_last_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.role = 'admin'
      and (select count(*) from public.members where role = 'admin' and id <> old.id) = 0 then
      raise exception 'last_admin';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and old.role = 'admin' and new.role <> 'admin'
    and (select count(*) from public.members where role = 'admin' and id <> old.id) = 0 then
    raise exception 'last_admin';
  end if;
  return new;
end;
$$;

create trigger members_protect_last_admin
  before update or delete on public.members
  for each row execute function public.protect_last_admin();

create or replace function public.members_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.id <> old.id or new.created_at <> old.created_at then
    raise exception 'immutable';
  end if;
  new.email := lower(new.email);

  if auth.role() = 'service_role' then
    return new;
  end if;

  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'user_link_locked';
  end if;

  return new;
end;
$$;

create trigger members_update_guard
  before update on public.members
  for each row execute function public.members_update_guard();

create or replace function public.feedback_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' and not public.is_admin() then
    raise exception 'forbidden';
  end if;
  if new.id <> old.id
    or new.author_id <> old.author_id
    or new.kind <> old.kind
    or new.title <> old.title
    or new.body <> old.body
    or new.screenshot_key is distinct from old.screenshot_key
    or new.created_at <> old.created_at then
    raise exception 'only_status';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger feedback_update_guard
  before update on public.feedback
  for each row execute function public.feedback_update_guard();

create or replace function public.list_photos(
  p_scope text,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer
)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  display_key text,
  thumb_key text,
  filename text,
  content_type text,
  byte_size bigint,
  width integer,
  height integer,
  captured_at timestamptz,
  created_at timestamptz,
  uploader_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.id,
    p.owner_id,
    p.original_key,
    p.display_key,
    p.thumb_key,
    p.filename,
    p.content_type,
    p.byte_size,
    p.width,
    p.height,
    p.captured_at,
    p.created_at,
    coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)) as uploader_name
  from public.photos p
  join public.members m on m.id = p.owner_id
  where public.is_group_member()
    and (p_scope = 'group' or p.owner_id = public.current_member_id())
    and (
      p_cursor_at is null
      or (p.captured_at, p.id) < (p_cursor_at, p_cursor_id)
    )
  order by p.captured_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 49);
$$;

create or replace function public.claim_initial_admin(
  p_email text,
  p_user_id uuid,
  p_display_name text
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.members;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  perform pg_advisory_xact_lock(hashtext('sicpic-initial-admin'));

  select * into result from public.members where email = lower(p_email);
  if found then
    if result.user_id is null then
      update public.members
      set user_id = p_user_id,
          display_name = coalesce(nullif(display_name, ''), left(p_display_name, 80))
      where id = result.id
      returning * into result;
    elsif result.user_id <> p_user_id then
      return null;
    end if;
    return result;
  end if;

  if exists (select 1 from public.members where role = 'admin') then
    return null;
  end if;

  insert into public.members (email, role, user_id, display_name)
  values (lower(p_email), 'admin', p_user_id, left(coalesce(p_display_name, ''), 80))
  returning * into result;

  return result;
end;
$$;

revoke all on function public.current_member_id() from public, anon;
revoke all on function public.is_group_member() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.list_photos(text, timestamptz, uuid, integer) from public, anon;
revoke all on function public.claim_initial_admin(text, uuid, text) from public, anon, authenticated;
revoke all on function public.protect_last_admin() from public, anon, authenticated;
revoke all on function public.members_update_guard() from public, anon, authenticated;
revoke all on function public.feedback_update_guard() from public, anon, authenticated;

grant execute on function public.current_member_id() to authenticated, service_role;
grant execute on function public.is_group_member() to authenticated, service_role;
grant execute on function public.is_admin() to authenticated, service_role;
grant execute on function public.list_photos(text, timestamptz, uuid, integer) to authenticated, service_role;
grant execute on function public.claim_initial_admin(text, uuid, text) to service_role;
