-- Videos sit in the same private photos table. Run this in the Supabase SQL editor
-- after 20261028120000_init.sql. Do not point it at production from CI.

alter table public.photos
  add column media_type text not null default 'photo',
  add column duration_ms integer,
  add column codec text;

alter table public.photos alter column display_key drop not null;
alter table public.photos alter column thumb_key drop not null;

alter table public.photos drop constraint photos_byte_size;
alter table public.photos drop constraint photos_content_type;
alter table public.photos drop constraint photos_keys_owned;

alter table public.photos
  add constraint photos_media_type check (media_type in ('photo', 'video')),
  add constraint photos_codec_len check (codec is null or char_length(codec) between 1 and 16),
  add constraint photos_duration check (
    (media_type = 'photo' and duration_ms is null)
    or (media_type = 'video' and duration_ms is not null and duration_ms >= 0)
  ),
  add constraint photos_byte_size check (
    (media_type = 'photo' and byte_size > 0 and byte_size <= 52428800)
    or (media_type = 'video' and byte_size > 0 and byte_size <= 4294967296)
  ),
  add constraint photos_content_type check (
    (media_type = 'photo' and content_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif'))
    or (media_type = 'video' and content_type in ('video/mp4', 'video/quicktime', 'video/3gpp', 'video/webm'))
  ),
  add constraint photos_keys_owned check (
    original_key !~ '\.\.'
    and (
      (
        media_type = 'photo'
        and original_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/original\.(jpg|png|heic|heif)$')
        and display_key = 'members/' || owner_id::text || '/photos/' || id::text || '/display.jpg'
        and thumb_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb.jpg'
      )
      or (
        media_type = 'video'
        and original_key ~ ('^members/' || owner_id::text || '/photos/' || id::text || '/original\.(mp4|mov|3gp|webm)$')
        and display_key is null
        and (
          thumb_key is null
          or thumb_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb.webp'
        )
      )
    )
  );

drop function public.list_photos(text, timestamptz, uuid, integer);

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
  codec text
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
    coalesce(nullif(m.display_name, ''), split_part(m.email, '@', 1)) as uploader_name,
    p.media_type,
    p.duration_ms,
    p.codec
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

revoke all on function public.list_photos(text, timestamptz, uuid, integer, text) from public, anon;
grant execute on function public.list_photos(text, timestamptz, uuid, integer, text) to authenticated, service_role;
