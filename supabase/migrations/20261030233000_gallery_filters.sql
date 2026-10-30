-- Person and date filters for the group timeline. Run after
-- 20261030230000_invites.sql. Not applied to production from the repository.
-- Extra arguments have defaults, so existing list_photos and photo_months
-- calls keep working.

drop function public.list_photos(text, timestamptz, uuid, integer, text);
drop function public.photo_months(text, text);

create function public.list_photos(
  p_scope text,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_media text default 'all',
  p_owner uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (
  id uuid,
  owner_id uuid,
  original_key text,
  display_key text,
  thumb_key text,
  thumb_large_key text,
  filename text,
  content_type text,
  byte_size bigint,
  width integer,
  height integer,
  captured_at timestamptz,
  created_at timestamptz,
  uploader_name text,
  media_type text,
  duration_ms integer,
  codec text,
  blur_data text
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
    p.thumb_large_key,
    p.filename,
    p.content_type,
    p.byte_size,
    p.width,
    p.height,
    p.captured_at,
    p.created_at,
    coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)) as uploader_name,
    p.media_type,
    p.duration_ms,
    p.codec,
    p.blur_data
  from public.photos p
  join public.members m on m.id = p.owner_id
  where public.is_group_member()
    and (p_scope = 'group' or p.owner_id = public.current_member_id())
    and (p_media is null or p_media = 'all' or p.media_type = p_media)
    and (p_owner is null or p.owner_id = p_owner)
    and (p_from is null or p.captured_at >= p_from)
    and (p_to is null or p.captured_at < p_to)
    and (
      p_cursor_at is null
      or (p.captured_at, p.id) < (p_cursor_at, p_cursor_id)
    )
  order by p.captured_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 49);
$$;

create function public.photo_months(
  p_scope text,
  p_media text default 'all',
  p_owner uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null
)
returns table (month_key text, photo_count integer)
language sql
stable
security invoker
set search_path = public
as $$
  select
    to_char(p.captured_at at time zone 'Europe/Berlin', 'YYYY-MM') as month_key,
    count(*)::integer as photo_count
  from public.photos p
  where public.is_group_member()
    and (p_scope = 'group' or p.owner_id = public.current_member_id())
    and (p_media is null or p_media = 'all' or p.media_type = p_media)
    and (p_owner is null or p.owner_id = p_owner)
    and (p_from is null or p.captured_at >= p_from)
    and (p_to is null or p.captured_at < p_to)
  group by 1
  order by 1 desc;
$$;

create function public.list_uploaders(p_scope text)
returns table (id uuid, display_name text)
language sql
stable
security invoker
set search_path = public
as $$
  select
    m.id,
    coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)) as display_name
  from public.members m
  where public.is_group_member()
    and (p_scope = 'group' or m.id = public.current_member_id())
    and exists (
      select 1
      from public.photos p
      where p.owner_id = m.id
        and (p_scope = 'group' or p.owner_id = public.current_member_id())
    )
  order by 2;
$$;

revoke all on function public.list_photos(text, timestamptz, uuid, integer, text, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.photo_months(text, text, uuid, timestamptz, timestamptz) from public, anon;
revoke all on function public.list_uploaders(text) from public, anon;
grant execute on function public.list_photos(text, timestamptz, uuid, integer, text, uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.photo_months(text, text, uuid, timestamptz, timestamptz) to authenticated, service_role;
grant execute on function public.list_uploaders(text) to authenticated, service_role;
