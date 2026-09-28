-- GitHub App installations, one-time connection states and durable webhook intake.

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  installation_id bigint not null check (installation_id > 0),
  account_id bigint not null check (account_id > 0),
  account_login text not null check (char_length(account_login) between 1 and 255),
  account_type text not null check (account_type in ('User', 'Organization', 'Enterprise')),
  repository_selection text not null check (repository_selection in ('all', 'selected')),
  permissions jsonb not null default '{}'::jsonb check (jsonb_typeof(permissions) = 'object'),
  status text not null default 'active' check (status in ('active', 'suspended', 'revoked')),
  installed_by text not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, installation_id)
);
create index github_installations_installation_idx
  on public.github_installations (installation_id) where status <> 'revoked';
create trigger github_installations_updated_at before update on public.github_installations
  for each row execute function private.set_updated_at();

create table public.github_connection_states (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id text not null references public.profiles(id) on delete cascade,
  state_hash text not null unique check (state_hash ~ '^[a-f0-9]{64}$'),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index github_connection_states_expiry_idx
  on public.github_connection_states (expires_at) where used_at is null;

create table public.github_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_id text not null unique check (char_length(delivery_id) between 1 and 160),
  event text not null check (char_length(event) between 1 and 120),
  action text check (action is null or char_length(action) between 1 and 120),
  installation_id bigint,
  repository_id bigint,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processed', 'failed', 'ignored')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  error text check (error is null or char_length(error) <= 2000),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index github_webhook_deliveries_pending_idx
  on public.github_webhook_deliveries (received_at) where status = 'pending';
create index github_webhook_deliveries_installation_idx
  on public.github_webhook_deliveries (installation_id, received_at desc);

create table public.github_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  operation text not null check (char_length(operation) between 1 and 120),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'cancelled')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 20),
  error text check (error is null or char_length(error) <= 2000),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index github_sync_jobs_workspace_idx
  on public.github_sync_jobs (workspace_id, created_at desc);
create index github_sync_jobs_pending_idx
  on public.github_sync_jobs (created_at) where status = 'pending';

revoke all on public.github_installations, public.github_connection_states,
  public.github_webhook_deliveries, public.github_sync_jobs from public, anon, authenticated;
grant select, delete on public.github_installations to authenticated;
grant select on public.github_sync_jobs to authenticated;

alter table public.github_installations enable row level security;
alter table public.github_connection_states enable row level security;
alter table public.github_webhook_deliveries enable row level security;
alter table public.github_sync_jobs enable row level security;

create policy github_installations_read_member on public.github_installations
  for select to authenticated using (private.is_workspace_member(workspace_id));
create policy github_installations_disconnect_admin on public.github_installations
  for delete to authenticated using (private.can_manage_workspace(workspace_id));
create policy github_sync_jobs_read_member on public.github_sync_jobs
  for select to authenticated using (private.is_workspace_member(workspace_id));

-- Connection states and raw webhook payloads are server-only. RLS intentionally
-- has no authenticated policies; the service-role client performs those writes.
