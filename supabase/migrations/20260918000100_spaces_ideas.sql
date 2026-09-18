-- Phase 1: team invitations and membership management.
-- These RPCs are service-role only. The Next.js server verifies the Clerk user
-- and passes their identity; clients cannot invoke them with a publishable key.

create extension if not exists pgcrypto with schema extensions;

create table public.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) between 3 and 254),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  invited_by text not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index workspace_invitations_workspace_idx
  on public.workspace_invitations (workspace_id, created_at desc);
create index workspace_invitations_actor_idx
  on public.workspace_invitations (invited_by, created_at desc);
create trigger workspace_invitations_updated_at before update on public.workspace_invitations
  for each row execute function private.set_updated_at();

alter table public.workspace_invitations enable row level security;
revoke all on public.workspace_invitations from public, anon, authenticated;
grant select on public.workspace_invitations to authenticated;
create policy invitations_read_manager on public.workspace_invitations for select to authenticated
  using (private.can_manage_workspace(workspace_id));

-- Members may see the display names of people sharing any of their spaces.
create function private.shares_workspace_with(target_user_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_memberships mine
    join public.workspace_memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.jwt()->>'sub') and theirs.user_id = target_user_id
  );
$$;
revoke all on function private.shares_workspace_with(text) from public, anon, authenticated;
grant execute on function private.shares_workspace_with(text) to authenticated;
create policy profiles_read_teammate on public.profiles for select to authenticated
  using (private.shares_workspace_with(id));

create function public.create_workspace_invitation(
  actor_id text, target_workspace_id uuid, invited_email text, invited_role text, new_token_hash text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid;
begin
  if not exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = actor_id and role in ('owner', 'admin')
  ) then raise exception 'Not allowed to invite to this workspace' using errcode = '42501'; end if;
  if invited_email is null or invited_email <> lower(trim(invited_email))
     or invited_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(invited_email) > 254
     or invited_role not in ('admin', 'editor', 'viewer')
     or new_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_invitations
      where invited_by = actor_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Invitation limit reached' using errcode = '22023';
  end if;
  update public.workspace_invitations set status = 'revoked'
    where workspace_id = target_workspace_id and email = invited_email and status = 'pending';
  insert into public.workspace_invitations (workspace_id, email, role, token_hash, invited_by)
    values (target_workspace_id, invited_email, invited_role, new_token_hash, actor_id)
    returning id into invitation_id;
  return invitation_id;
end;
$$;

create function public.revoke_workspace_invitation(actor_id text, invitation_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id from public.workspace_invitations where id = invitation_id;
  if target_workspace_id is null or not exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = actor_id and role in ('owner', 'admin')
  ) then raise exception 'Not allowed to revoke this invitation' using errcode = '42501'; end if;
  update public.workspace_invitations set status = 'revoked'
    where id = invitation_id and status = 'pending';
  return found;
end;
$$;

create function public.accept_workspace_invitation(
  accepting_user_id text, verified_email text, display_name text, raw_token text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype;
begin
  if accepting_user_id is null or accepting_user_id = '' or verified_email is null
     or raw_token !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid acceptance' using errcode = '22023';
  end if;
  select * into invitation from public.workspace_invitations
    where token_hash = encode(extensions.digest(raw_token, 'sha256'), 'hex') for update;
  if not found or invitation.status <> 'pending' or invitation.expires_at <= now()
     or invitation.email <> lower(trim(verified_email)) then
    raise exception 'Invitation unavailable' using errcode = '22023';
  end if;
  insert into public.profiles (id, display_name)
    values (accepting_user_id, left(coalesce(nullif(trim(display_name), ''), 'Creador'), 120))
    on conflict (id) do nothing;
  insert into public.workspace_memberships (workspace_id, user_id, role)
    values (invitation.workspace_id, accepting_user_id, invitation.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invitations set status = 'accepted', accepted_by = accepting_user_id
    where id = invitation.id;
  return invitation.workspace_id;
end;
$$;

create function public.manage_workspace_member(
  actor_id text, target_workspace_id uuid, target_user_id text, next_role text
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare actor_role text; member_role text;
begin
  select role into actor_role from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = actor_id;
  select role into member_role from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = target_user_id for update;
  if actor_role is null or actor_role not in ('owner', 'admin') or member_role is null
     or member_role = 'owner' or actor_id = target_user_id
     or (actor_role = 'admin' and member_role = 'admin')
     or (next_role is not null and next_role not in ('admin', 'editor', 'viewer')) then
    raise exception 'Not allowed to change this member' using errcode = '42501';
  end if;
  if next_role is null then
    delete from public.workspace_memberships
      where workspace_id = target_workspace_id and user_id = target_user_id;
  else
    update public.workspace_memberships set role = next_role
      where workspace_id = target_workspace_id and user_id = target_user_id;
  end if;
  return true;
end;
$$;

revoke all on function public.create_workspace_invitation(text, uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.revoke_workspace_invitation(text, uuid) from public, anon, authenticated;
revoke all on function public.accept_workspace_invitation(text, text, text, text) from public, anon, authenticated;
revoke all on function public.manage_workspace_member(text, uuid, text, text) from public, anon, authenticated;
grant execute on function public.create_workspace_invitation(text, uuid, text, text, text) to service_role;
grant execute on function public.revoke_workspace_invitation(text, uuid) to service_role;
grant execute on function public.accept_workspace_invitation(text, text, text, text) to service_role;
grant execute on function public.manage_workspace_member(text, uuid, text, text) to service_role;

create function public.search_workspace_ideas(
  target_workspace_id uuid, search_term text default '', filter_status text default 'active', filter_kind text default ''
)
returns setof public.ideas language sql stable security invoker set search_path = '' as $$
  select i.* from public.ideas i
  where i.workspace_id = target_workspace_id
    and (filter_status = 'all' or i.status = filter_status)
    and (filter_kind = '' or i.kind = filter_kind)
    and (coalesce(search_term, '') = '' or i.title ilike '%' || search_term || '%'
      or i.description ilike '%' || search_term || '%'
      or exists (select 1 from unnest(i.tags) tag where tag ilike '%' || search_term || '%'))
  order by i.created_at desc
  limit 200;
$$;
revoke all on function public.search_workspace_ideas(uuid, text, text, text) from public, anon;
grant execute on function public.search_workspace_ideas(uuid, text, text, text) to authenticated;
