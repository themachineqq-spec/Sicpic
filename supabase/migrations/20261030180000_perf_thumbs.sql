-- Smaller cached thumbnails, a blur placeholder, and month counts for the scrubber.
-- Run after 20261030140000_video_media.sql. Not applied to production from CI.

alter table public.photos
  add column thumb_large_key text,
  add column blur_data text;

alter table public.photos drop constraint photos_keys_owned;

alter table public.photos
  add constraint photos_blur_len check (
    blur_data is null
    or (char_length(blur_data) between 32 and 2000 and blur_data like 'data:image/%')
  ),
  add constraint photos_keys_owned check (
    original_key !~ '\.\.'
    and (
      (
        media_type = 'photo'
        and original_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/original\.(jpg|png|heic|heif)$')
        and display_key = 'members/' || owner_id::text || '/photos/' || id::text || '/display.jpg'
        and thumb_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/thumb(-320)?\.(jpg|webp)$')
        and (
          thumb_large_key is null
          or thumb_large_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb-640' || substring(thumb_key from '\.(jpg|webp)$')
        )
      )
      or (
        media_type = 'video'
        and original_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/original\.(mp4|mov|3gp|webm)$')
        and display_key is null
        and (
          thumb_key is null
          or thumb_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/thumb(-320)?\.(jpg|webp)$')
        )
        and (
          thumb_large_key is null
          or (
            thumb_key is not null
            and thumb_large_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb-640' || substring(thumb_key from '\.(jpg|webp)$')
          )
        )
      )
    )
  );

create index photos_media_timeline_idx on public.photos (media_type, captured_at desc, id desc);
create index photos_owner_media_timeline_idx on public.photos (owner_id, media_type, captured_at desc, id desc);

drop function public.list_photos(text, timestamptz, uuid, integer, text);

create function public.list_photos(
  p_scope text,
  p_cursor_at timestamptz,
  p_cursor_id uuid,
  p_limit integer,
  p_media text default 'all'
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
    and (
      p_cursor_at is null
      or (p.captured_at, p.id) < (p_cursor_at, p_cursor_id)
    )
  order by p.captured_at desc, p.id desc
  limit least(greatest(coalesce(p_limit, 24), 1), 49);
$$;

create function public.photo_months(p_scope text, p_media text default 'all')
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
  group by 1
  order by 1 desc;
$$;

create function public.attach_thumb_set(
  p_id uuid,
  p_thumb text,
  p_large text,
  p_blur text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_member_id() is null then
    raise exception 'forbidden';
  end if;
  update public.photos
  set thumb_key = p_thumb,
      thumb_large_key = p_large,
      blur_data = p_blur
  where id = p_id
    and owner_id = public.current_member_id();
  if not found then
    raise exception 'forbidden';
  end if;
end;
$$;

revoke all on function public.list_photos(text, timestamptz, uuid, integer, text) from public, anon;
revoke all on function public.photo_months(text, text) from public, anon;
revoke all on function public.attach_thumb_set(uuid, text, text, text) from public, anon;
grant execute on function public.list_photos(text, timestamptz, uuid, integer, text) to authenticated, service_role;
grant execute on function public.photo_months(text, text) to authenticated, service_role;
grant execute on function public.attach_thumb_set(uuid, text, text, text) to authenticated;
