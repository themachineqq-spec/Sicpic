-- Fix photos_keys_owned from 20261030180000_perf_thumbs.sql.
-- substring(thumb_key from '\.(jpg|webp)$') returns only the capture group ("webp",
-- without the dot), so the expected large key became ".../thumb-640webp" and every
-- insert or attach_thumb_set call with a thumb-640 key was rejected. That broke video
-- uploads ("Die Videodaten konnten nicht gespeichert werden.") and sized photo previews.
-- The new check adds the dot explicitly. Existing rows are unaffected (none can carry
-- a thumb_large_key under the old check). Run after 20261030180000_perf_thumbs.sql.

alter table public.photos drop constraint photos_keys_owned;

alter table public.photos
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
          or thumb_large_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb-640.' || substring(thumb_key from '\.(jpg|webp)$')
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
            and thumb_large_key = 'members/' || owner_id::text || '/photos/' || id::text || '/thumb-640.' || substring(thumb_key from '\.(jpg|webp)$')
          )
        )
      )
    )
  );
