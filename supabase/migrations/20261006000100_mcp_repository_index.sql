-- MCP's on-demand GitHub source index. Files are server-only and scoped to the
-- repository linked to a project; no raw GitHub credentials are persisted.

alter table public.project_repositories
  add column indexed_commit_sha text check (indexed_commit_sha is null or indexed_commit_sha ~ '^[0-9a-f]{40}$'),
  add column indexed_at timestamptz;

alter table public.project_repositories
  add constraint project_repositories_project_workspace_unique unique (project_id, workspace_id);

create table public.project_repository_index_files (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  workspace_id uuid not null,
  github_repository_id bigint not null check (github_repository_id > 0),
  path text not null check (char_length(path) between 1 and 1024),
  source_commit_sha text not null check (source_commit_sha ~ '^[0-9a-f]{40}$'),
  blob_sha text not null check (blob_sha ~ '^[0-9a-f]{40}$'),
  size_bytes integer not null check (size_bytes between 0 and 48000),
  content text not null check (char_length(content) <= 48000),
  indexed_at timestamptz not null default now(),
  unique (project_id, github_repository_id, path, source_commit_sha),
  foreign key (project_id, workspace_id)
    references public.project_repositories(project_id, workspace_id) on delete cascade
);

create index project_repository_index_files_active_idx
  on public.project_repository_index_files(project_id, source_commit_sha, path);

revoke all on public.project_repository_index_files from public, anon, authenticated;
alter table public.project_repository_index_files enable row level security;
