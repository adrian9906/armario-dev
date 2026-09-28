-- Repository linked to each Armario Dev project. Remote mutations are performed
-- only by the server after checking project manager access.

create table public.project_repositories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  installation_id bigint not null check (installation_id > 0),
  repository_id bigint not null check (repository_id > 0),
  owner_login text not null check (char_length(owner_login) between 1 and 255),
  name text not null check (char_length(name) between 1 and 255),
  full_name text not null check (char_length(full_name) between 3 and 512),
  description text check (description is null or char_length(description) <= 1000),
  html_url text not null check (html_url ~ '^https://github\.com/'),
  clone_url text not null check (clone_url ~ '^https://github\.com/'),
  ssh_url text not null check (ssh_url ~ '^git@github\.com:'),
  default_branch text not null check (char_length(default_branch) between 1 and 255),
  visibility text not null check (visibility in ('public', 'private', 'internal')),
  archived boolean not null default false,
  created_by text not null references public.profiles(id),
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id),
  unique (installation_id, repository_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade,
  foreign key (workspace_id, installation_id)
    references public.github_installations(workspace_id, installation_id) on delete cascade
);

create index project_repositories_workspace_idx
  on public.project_repositories (workspace_id, updated_at desc);
create trigger project_repositories_updated_at before update on public.project_repositories
  for each row execute function private.set_updated_at();

revoke all on public.project_repositories from public, anon, authenticated;
grant select on public.project_repositories to authenticated;
alter table public.project_repositories enable row level security;

create policy project_repositories_read on public.project_repositories
  for select to authenticated using (private.can_view_project(project_id));

