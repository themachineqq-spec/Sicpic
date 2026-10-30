-- A member may rename only themselves. Role, email, and the login link stay
-- with admins. Run after 20261030233000_gallery_filters.sql.
-- Not applied to production from the repository.

alter table public.members drop constraint if exists members_display_name_len;

alter table public.members
  add constraint members_display_name_len check (
    display_name is null
    or (
      char_length(display_name) between 1 and 80
      and display_name = btrim(display_name)
      and display_name !~ '[[:cntrl:]]'
    )
  );

drop policy if exists members_update_own_name on public.members;

create policy members_update_own_name on public.members
  for update to authenticated
  using (id = public.current_member_id())
  with check (id = public.current_member_id());

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

  if new.user_id is distinct from old.user_id then
    raise exception 'user_link_locked';
  end if;

  if public.is_admin() then
    return new;
  end if;

  if old.id is distinct from public.current_member_id()
    or new.role is distinct from old.role
    or new.email is distinct from old.email
    or new.created_by is distinct from old.created_by then
    raise exception 'only_display_name';
  end if;

  return new;
end;
$$;
