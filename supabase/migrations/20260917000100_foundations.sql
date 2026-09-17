-- Armario Dev foundations. Identity comes from Clerk's verified JWT `sub` claim.
-- Configure Clerk as a Supabase third-party auth provider before using the Data API.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.profiles (
  id text primary key,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_id text not null references public.profiles(id),
  is_personal boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_personal_workspace_per_user
  on public.workspaces (owner_id) where is_personal;

create table public.workspace_memberships (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_memberships_user_id_idx
  on public.workspace_memberships (user_id, workspace_id);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  author_id text not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  kind text check (kind in ('web', 'mobile', 'frontend', 'backend', 'mixed', 'other', 'undecided')),
  status text not null default 'active' check (status in ('active', 'converted', 'archived')),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create index ideas_workspace_created_idx on public.ideas (workspace_id, created_at desc);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  origin_idea_id uuid unique,
  creator_id text not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  objective text not null default '',
  kind text not null check (kind in ('web', 'mobile', 'frontend', 'backend', 'mixed', 'other')),
  stage text not null default 'definition' check (stage in ('definition', 'planning', 'development', 'published', 'archived')),
  modules jsonb not null default '{"frontend": false, "backend": false, "database": false, "auth": false}'::jsonb
    check (jsonb_typeof(modules) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (origin_idea_id, workspace_id) references public.ideas(id, workspace_id)
);

create index projects_workspace_created_idx on public.projects (workspace_id, created_at desc);

create function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces
  for each row execute function private.set_updated_at();
create trigger ideas_updated_at before update on public.ideas
  for each row execute function private.set_updated_at();
create trigger projects_updated_at before update on public.projects
  for each row execute function private.set_updated_at();

-- Security-definer helpers avoid recursive membership RLS checks.
create function private.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_memberships m
    where m.workspace_id = target_workspace_id
      and m.user_id = (select auth.jwt()->>'sub')
  );
$$;

create function private.workspace_role(target_workspace_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select m.role from public.workspace_memberships m
  where m.workspace_id = target_workspace_id
    and m.user_id = (select auth.jwt()->>'sub')
  limit 1;
$$;

create function private.can_edit_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.workspace_role(target_workspace_id) in ('owner', 'admin', 'editor'), false);
$$;

create function private.can_manage_workspace(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.workspace_role(target_workspace_id) in ('owner', 'admin'), false);
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.workspace_role(uuid) to authenticated;
grant execute on function private.can_edit_workspace(uuid) to authenticated;
grant execute on function private.can_manage_workspace(uuid) to authenticated;

create function private.add_workspace_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.workspace_memberships (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger workspace_created_add_owner after insert on public.workspaces
  for each row execute function private.add_workspace_owner();

-- Clerk users do not appear in auth.users. Provision the personal space on first sign-in.
create function public.ensure_personal_workspace(chosen_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  requester text := nullif(auth.jwt()->>'sub', '');
  workspace_id uuid;
  safe_name text := left(coalesce(nullif(trim(chosen_name), ''), 'Creador'), 120);
begin
  if requester is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (requester, safe_name)
  on conflict (id) do nothing;

  insert into public.workspaces (name, owner_id, is_personal)
  values ('Mi espacio', requester, true)
  on conflict do nothing;

  select w.id into workspace_id from public.workspaces w
  where w.owner_id = requester and w.is_personal;
  return workspace_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(text) from public, anon;
grant execute on function public.ensure_personal_workspace(text) to authenticated;

revoke all on public.profiles, public.workspaces, public.workspace_memberships,
  public.ideas, public.projects from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant select, insert on public.workspaces to authenticated;
grant update (name) on public.workspaces to authenticated;
grant select on public.workspace_memberships to authenticated;
grant select, insert on public.ideas, public.projects to authenticated;
grant update (title, description, kind, status, tags) on public.ideas to authenticated;
grant update (title, objective, kind, stage, modules) on public.projects to authenticated;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_memberships enable row level security;
alter table public.ideas enable row level security;
alter table public.projects enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.jwt()->>'sub'));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = (select auth.jwt()->>'sub'))
  with check (id = (select auth.jwt()->>'sub'));

create policy workspaces_read_member on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
create policy workspaces_create_self on public.workspaces for insert to authenticated
  with check (owner_id = (select auth.jwt()->>'sub'));
create policy workspaces_update_admin on public.workspaces for update to authenticated
  using (private.can_manage_workspace(id))
  with check (private.can_manage_workspace(id));

create policy memberships_read_member on public.workspace_memberships for select to authenticated
  using (private.is_workspace_member(workspace_id));

create policy ideas_read_member on public.ideas for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy ideas_create_editor on public.ideas for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and author_id = (select auth.jwt()->>'sub'));
create policy ideas_update_editor on public.ideas for update to authenticated
  using (private.can_edit_workspace(workspace_id))
  with check (private.can_edit_workspace(workspace_id));

create policy projects_read_member on public.projects for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy projects_create_editor on public.projects for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy projects_update_editor on public.projects for update to authenticated
  using (private.can_edit_workspace(workspace_id))
  with check (private.can_edit_workspace(workspace_id));
