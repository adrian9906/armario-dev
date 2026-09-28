-- Trace Armario Dev documents published to a linked GitHub repository.

create table public.github_publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_repositories(project_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  repository_id bigint not null check (repository_id > 0),
  source_type text not null check (source_type in ('requirement', 'decision', 'diagram')),
  source_id uuid not null,
  path text not null check (char_length(path) between 1 and 1000 and path !~ '(^|/)\.\.(/|$)'),
  branch text not null check (char_length(branch) between 1 and 255),
  last_commit_sha text not null check (last_commit_sha ~ '^[a-f0-9]{40}$'),
  published_by text references public.profiles(id) on delete set null,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, source_type, source_id),
  unique (repository_id, path),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);

create index github_publications_project_idx
  on public.github_publications (project_id, published_at desc);
create trigger github_publications_updated_at before update on public.github_publications
  for each row execute function private.set_updated_at();

revoke all on public.github_publications from public, anon, authenticated;
grant select on public.github_publications to authenticated;
alter table public.github_publications enable row level security;

create policy github_publications_read on public.github_publications
  for select to authenticated using (private.can_view_project(project_id));

