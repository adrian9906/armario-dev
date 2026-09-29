-- Project-level GitHub automations, durable task links and an auditable event log.

create table public.github_automation_settings (
  project_id uuid primary key references public.project_repositories(project_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_issue_enabled boolean not null default false,
  task_branch_enabled boolean not null default false,
  task_pr_enabled boolean not null default false,
  pr_merge_completes_task boolean not null default false,
  issue_state_sync boolean not null default false,
  document_publish_enabled boolean not null default false,
  notifications_enabled boolean not null default true,
  branch_prefix text not null default 'task' check (branch_prefix ~ '^[a-z0-9][a-z0-9._/-]{0,39}$'),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create trigger github_automation_settings_updated_at before update on public.github_automation_settings
  for each row execute function private.set_updated_at();

create table public.github_task_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_repositories(project_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  repository_id bigint not null check (repository_id > 0),
  task_id uuid not null,
  issue_number bigint check (issue_number is null or issue_number > 0),
  issue_url text check (issue_url is null or issue_url ~ '^https://github\.com/'),
  issue_state text check (issue_state is null or issue_state in ('open', 'closed')),
  branch_name text check (branch_name is null or char_length(branch_name) between 1 and 255),
  branch_head_sha text check (branch_head_sha is null or branch_head_sha ~ '^[a-f0-9]{40}$'),
  pull_request_number bigint check (pull_request_number is null or pull_request_number > 0),
  pull_request_url text check (pull_request_url is null or pull_request_url ~ '^https://github\.com/'),
  pull_request_state text check (pull_request_state is null or pull_request_state in ('open', 'closed', 'merged')),
  remote_version timestamptz,
  last_origin text not null default 'armario' check (last_origin in ('armario', 'github')),
  last_event text not null default 'linked' check (char_length(last_event) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (task_id),
  foreign key (task_id, workspace_id, project_id) references public.tasks(id, workspace_id, project_id) on delete cascade,
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create unique index github_task_links_issue_idx on public.github_task_links (repository_id, issue_number)
  where issue_number is not null;
create unique index github_task_links_branch_idx on public.github_task_links (repository_id, branch_name)
  where branch_name is not null;
create unique index github_task_links_pr_idx on public.github_task_links (repository_id, pull_request_number)
  where pull_request_number is not null;
create index github_task_links_project_idx on public.github_task_links (project_id, updated_at desc);
create trigger github_task_links_updated_at before update on public.github_task_links
  for each row execute function private.set_updated_at();

create table public.github_automation_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.project_repositories(project_id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  dedupe_key text not null unique check (char_length(dedupe_key) between 8 and 500),
  origin text not null check (origin in ('armario', 'github')),
  event text not null check (char_length(event) between 1 and 120),
  remote_id text check (remote_id is null or char_length(remote_id) <= 160),
  remote_version timestamptz,
  status text not null check (status in ('running', 'completed', 'failed', 'ignored')),
  summary text not null check (char_length(summary) between 1 and 500),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  error text check (error is null or char_length(error) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index github_automation_events_project_idx
  on public.github_automation_events (project_id, created_at desc);

alter table public.notification_preferences add column github boolean not null default true;
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('assignment', 'comment', 'project_access', 'github'));

revoke all on public.github_automation_settings, public.github_task_links,
  public.github_automation_events from public, anon, authenticated;
grant select on public.github_automation_settings, public.github_task_links,
  public.github_automation_events to authenticated;

alter table public.github_automation_settings enable row level security;
alter table public.github_task_links enable row level security;
alter table public.github_automation_events enable row level security;

create policy github_automation_settings_read on public.github_automation_settings
  for select to authenticated using (private.can_view_project(project_id));
create policy github_task_links_read on public.github_task_links
  for select to authenticated using (private.can_view_project(project_id));
create policy github_automation_events_read on public.github_automation_events
  for select to authenticated using (private.can_view_project(project_id));
