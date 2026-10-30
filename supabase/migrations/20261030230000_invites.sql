-- Einladungslinks. Der Klartext-Token bleibt beim Admin und im einmaligen
-- Link. In der Datenbank liegt nur der SHA-256-Hash. Einlösen macht die
-- Service-Role über redeem_invite (Zeilensperre, einmalig, ablaufend).

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  display_name text,
  role text not null default 'member',
  created_by uuid not null references public.members (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  used_at timestamptz,
  used_by uuid references public.members (id) on delete set null,
  constraint invites_token_hash_hex check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint invites_role check (role in ('admin', 'member')),
  constraint invites_display_name_len check (display_name is null or char_length(display_name) between 1 and 80),
  constraint invites_expires_after_create check (expires_at > created_at),
  constraint invites_used_pair check ((used_at is null) = (used_by is null))
);

create index invites_open_idx on public.invites (expires_at)
  where used_at is null and revoked_at is null;

alter table public.invites enable row level security;

revoke all on public.invites from public, anon;
grant select, insert, update on public.invites to authenticated;
grant select, insert, update, delete on public.invites to service_role;

create policy invites_select_admin on public.invites
  for select to authenticated
  using (public.is_admin());

create policy invites_insert_admin on public.invites
  for insert to authenticated
  with check (
    public.is_admin()
    and created_by = public.current_member_id()
    and used_at is null
    and used_by is null
    and revoked_at is null
  );

create policy invites_update_admin on public.invites
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.redeem_invite(
  p_token_hash text,
  p_user_id uuid,
  p_email text,
  p_display_name text
)
returns public.members
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.invites%rowtype;
  member public.members%rowtype;
  chosen_name text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'forbidden';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  if p_user_id is null or p_email is null or p_email <> lower(p_email) or position('@' in p_email) < 2 then
    return null;
  end if;

  select * into invite
  from public.invites
  where token_hash = p_token_hash
  for update;

  if not found
    or invite.revoked_at is not null
    or invite.used_at is not null
    or invite.expires_at <= now() then
    return null;
  end if;

  if exists (select 1 from public.members where email = p_email) then
    return null;
  end if;

  chosen_name := left(
    coalesce(nullif(btrim(invite.display_name), ''), nullif(btrim(p_display_name), ''), split_part(p_email, '@', 1)),
    80
  );

  insert into public.members (user_id, email, display_name, role, created_by)
  values (p_user_id, p_email, chosen_name, invite.role, invite.created_by)
  returning * into member;

  update public.invites
  set used_at = now(), used_by = member.id
  where id = invite.id
    and used_at is null
    and revoked_at is null
    and expires_at > now();

  if not found then
    raise exception 'invite_lost';
  end if;

  return member;
end;
$$;

revoke all on function public.redeem_invite(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.redeem_invite(text, uuid, text, text) to service_role;
