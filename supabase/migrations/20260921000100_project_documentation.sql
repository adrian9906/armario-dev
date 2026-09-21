-- Phase 3: technical stack, architecture decisions and editable diagrams.

create table public.project_technologies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  creator_id text not null references public.profiles(id),
  name text not null check (char_length(name) between 1 and 120),
  category text not null check (category in (
    'frontend', 'backend', 'database', 'auth', 'infrastructure', 'testing', 'devops', 'other'
  )),
  status text not null default 'candidate' check (status in ('candidate', 'selected', 'rejected')),
  version text not null default '' check (char_length(version) <= 80),
  rationale text not null default '' check (char_length(rationale) <= 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, project_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index project_technologies_project_idx on public.project_technologies (project_id, category, created_at);
create unique index project_technologies_name_idx on public.project_technologies (project_id, lower(name));
create trigger project_technologies_updated_at before update on public.project_technologies
  for each row execute function private.set_updated_at();

create table public.architecture_decisions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  creator_id text not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  context text not null default '' check (char_length(context) <= 10000),
  decision text not null default '' check (char_length(decision) <= 10000),
  consequences text not null default '' check (char_length(consequences) <= 10000),
  decided_at date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, project_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index architecture_decisions_project_idx on public.architecture_decisions (project_id, decided_at desc, created_at desc);
create trigger architecture_decisions_updated_at before update on public.architecture_decisions
  for each row execute function private.set_updated_at();

create table public.project_diagrams (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  creator_id text not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('flow', 'context', 'container', 'data_model')),
  source text not null check (char_length(source) between 1 and 50000),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, project_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index project_diagrams_project_idx on public.project_diagrams (project_id, kind, updated_at desc);
create trigger project_diagrams_updated_at before update on public.project_diagrams
  for each row execute function private.set_updated_at();

revoke all on public.project_technologies, public.architecture_decisions, public.project_diagrams
  from public, anon, authenticated;
grant select, insert on public.project_technologies, public.architecture_decisions, public.project_diagrams
  to authenticated;
grant update (name, category, status, version, rationale) on public.project_technologies to authenticated;
grant update (title, status, context, decision, consequences, decided_at) on public.architecture_decisions to authenticated;
grant update (title, kind, source, status) on public.project_diagrams to authenticated;
grant delete on public.project_technologies, public.architecture_decisions, public.project_diagrams to authenticated;

alter table public.project_technologies enable row level security;
alter table public.architecture_decisions enable row level security;
alter table public.project_diagrams enable row level security;

create policy project_technologies_read on public.project_technologies for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_technologies_create on public.project_technologies for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy project_technologies_update on public.project_technologies for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy project_technologies_delete on public.project_technologies for delete to authenticated
  using (private.can_edit_workspace(workspace_id));

create policy architecture_decisions_read on public.architecture_decisions for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy architecture_decisions_create on public.architecture_decisions for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy architecture_decisions_update on public.architecture_decisions for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy architecture_decisions_delete on public.architecture_decisions for delete to authenticated
  using (private.can_edit_workspace(workspace_id));

create policy project_diagrams_read on public.project_diagrams for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy project_diagrams_create on public.project_diagrams for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy project_diagrams_update on public.project_diagrams for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));
create policy project_diagrams_delete on public.project_diagrams for delete to authenticated
  using (private.can_edit_workspace(workspace_id));
