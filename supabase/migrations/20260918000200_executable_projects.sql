-- Phase 2: transactional idea conversion and project planning.

alter table public.projects
  add column origin_snapshot jsonb,
  add constraint projects_modules_shape check (
    modules ?& array['frontend', 'backend', 'database', 'auth']
    and jsonb_typeof(modules->'frontend') = 'boolean'
    and jsonb_typeof(modules->'backend') = 'boolean'
    and jsonb_typeof(modules->'database') = 'boolean'
    and jsonb_typeof(modules->'auth') = 'boolean'
    and modules - 'frontend' - 'backend' - 'database' - 'auth' = '{}'::jsonb
  );

-- Composite keys make it impossible to link records from different spaces.
alter table public.projects add constraint projects_id_workspace_unique unique (id, workspace_id);

create table public.requirements (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  creator_id text not null references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 10000),
  acceptance_criteria text not null default '' check (char_length(acceptance_criteria) <= 10000),
  kind text not null default 'functional' check (kind in ('functional', 'nonfunctional')),
  priority text not null default 'must' check (priority in ('must', 'should', 'could')),
  status text not null default 'active' check (status in ('active', 'archived')),
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, project_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index requirements_project_position_idx on public.requirements (project_id, position, created_at);
create trigger requirements_updated_at before update on public.requirements
  for each row execute function private.set_updated_at();

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  creator_id text not null references public.profiles(id),
  assignee_id text references public.profiles(id),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '' check (char_length(description) <= 10000),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'archived')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  due_date date,
  position integer not null default 0 check (position >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id, project_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index tasks_project_status_position_idx on public.tasks (project_id, status, position, created_at);
create index tasks_assignee_idx on public.tasks (workspace_id, assignee_id) where assignee_id is not null;
create trigger tasks_updated_at before update on public.tasks
  for each row execute function private.set_updated_at();

create function private.validate_task_assignee()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.assignee_id is not null and not exists (
    select 1 from public.workspace_memberships
    where workspace_id = new.workspace_id and user_id = new.assignee_id
  ) then raise exception 'Assignee must belong to the workspace' using errcode = '23514'; end if;
  return new;
end;
$$;
create trigger tasks_assignee_check before insert or update of assignee_id, workspace_id on public.tasks
  for each row execute function private.validate_task_assignee();

create function private.clear_departing_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.tasks set assignee_id = null
    where workspace_id = old.workspace_id and assignee_id = old.user_id;
  return old;
end;
$$;
create trigger member_departed_clear_tasks before delete on public.workspace_memberships
  for each row execute function private.clear_departing_assignee();

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  content text not null check (char_length(content) between 1 and 300),
  position integer not null default 0 check (position >= 0),
  completed_at timestamptz,
  completed_by text references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (task_id, workspace_id, project_id) references public.tasks(id, workspace_id, project_id) on delete cascade
);
create index checklist_task_position_idx on public.checklist_items (task_id, position, created_at);
create trigger checklist_updated_at before update on public.checklist_items
  for each row execute function private.set_updated_at();

create function private.checklist_completion_actor()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.completed_by := case when new.completed_at is null then null else auth.jwt()->>'sub' end;
  return new;
end;
$$;
create trigger checklist_actor before insert or update of completed_at on public.checklist_items
  for each row execute function private.checklist_completion_actor();

create table public.task_requirements (
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid not null,
  requirement_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, requirement_id),
  foreign key (task_id, workspace_id, project_id) references public.tasks(id, workspace_id, project_id) on delete cascade,
  foreign key (requirement_id, workspace_id, project_id) references public.requirements(id, workspace_id, project_id) on delete cascade
);
create index task_requirements_requirement_idx on public.task_requirements (requirement_id);

create table public.project_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  task_id uuid,
  requirement_id uuid,
  author_id text not null references public.profiles(id),
  content text not null check (char_length(content) between 1 and 5000),
  created_at timestamptz not null default now(),
  check ((task_id is null) <> (requirement_id is null)),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade,
  foreign key (task_id, workspace_id, project_id) references public.tasks(id, workspace_id, project_id) on delete cascade,
  foreign key (requirement_id, workspace_id, project_id) references public.requirements(id, workspace_id, project_id) on delete cascade
);
create index comments_task_idx on public.project_comments (task_id, created_at) where task_id is not null;
create index comments_requirement_idx on public.project_comments (requirement_id, created_at) where requirement_id is not null;

-- An idea row lock serializes conversion. Repeated submissions return the same project.
create function public.convert_idea_to_project(target_idea_id uuid, target_kind text, selected_modules jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare idea public.ideas%rowtype; result_id uuid; requester text := nullif(auth.jwt()->>'sub', '');
begin
  if requester is null or target_kind not in ('web', 'mobile', 'frontend', 'backend', 'mixed', 'other')
     or selected_modules is null or jsonb_typeof(selected_modules) <> 'object'
     or not (selected_modules ?& array['frontend', 'backend', 'database', 'auth'])
     or jsonb_typeof(selected_modules->'frontend') <> 'boolean'
     or jsonb_typeof(selected_modules->'backend') <> 'boolean'
     or jsonb_typeof(selected_modules->'database') <> 'boolean'
     or jsonb_typeof(selected_modules->'auth') <> 'boolean'
     or selected_modules - 'frontend' - 'backend' - 'database' - 'auth' <> '{}'::jsonb then
    raise exception 'Invalid project configuration' using errcode = '22023';
  end if;
  select * into idea from public.ideas where id = target_idea_id for update;
  if not found or not private.can_edit_workspace(idea.workspace_id) then
    raise exception 'Idea unavailable' using errcode = '42501';
  end if;
  select id into result_id from public.projects where origin_idea_id = target_idea_id;
  if result_id is not null then return result_id; end if;
  if idea.status <> 'active' then raise exception 'Idea cannot be converted' using errcode = '22023'; end if;
  insert into public.projects (workspace_id, origin_idea_id, creator_id, title, objective, kind, modules, origin_snapshot)
    values (idea.workspace_id, idea.id, requester, idea.title, idea.description, target_kind, selected_modules,
      jsonb_build_object('title', idea.title, 'description', idea.description, 'author_id', idea.author_id, 'created_at', idea.created_at))
    returning id into result_id;
  update public.ideas set status = 'converted' where id = idea.id;
  return result_id;
end;
$$;
revoke all on function public.convert_idea_to_project(uuid, text, jsonb) from public, anon;
grant execute on function public.convert_idea_to_project(uuid, text, jsonb) to authenticated;

-- Position is assigned while locking the project row, including concurrent task creation.
create function private.assign_task_position()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id for update;
  select coalesce(max(position), 0) + 1 into new.position from public.tasks where project_id = new.project_id;
  return new;
end;
$$;
create trigger tasks_position_before_insert before insert on public.tasks
  for each row execute function private.assign_task_position();

create function public.move_project_task(target_task_id uuid, direction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; neighbor_id uuid; neighbor_position integer;
begin
  if direction not in ('up', 'down') then raise exception 'Invalid direction' using errcode = '22023'; end if;
  select * into task_row from public.tasks where id = target_task_id for update;
  if not found or not private.can_edit_workspace(task_row.workspace_id) then
    raise exception 'Task unavailable' using errcode = '42501';
  end if;
  if direction = 'up' then
    select id, position into neighbor_id, neighbor_position from public.tasks
      where project_id = task_row.project_id and status <> 'archived' and position < task_row.position
      order by position desc limit 1 for update;
  else
    select id, position into neighbor_id, neighbor_position from public.tasks
      where project_id = task_row.project_id and status <> 'archived' and position > task_row.position
      order by position asc limit 1 for update;
  end if;
  if neighbor_id is null then return false; end if;
  update public.tasks set position = neighbor_position where id = task_row.id;
  update public.tasks set position = task_row.position where id = neighbor_id;
  return true;
end;
$$;
revoke all on function public.move_project_task(uuid, text) from public, anon;
grant execute on function public.move_project_task(uuid, text) to authenticated;

revoke all on public.requirements, public.tasks, public.checklist_items,
  public.task_requirements, public.project_comments from public, anon, authenticated;
grant select, insert on public.requirements, public.tasks, public.checklist_items,
  public.task_requirements, public.project_comments to authenticated;
grant update (title, description, acceptance_criteria, kind, priority, status, position)
  on public.requirements to authenticated;
grant update (title, description, assignee_id, status, priority, due_date, position)
  on public.tasks to authenticated;
grant update (content, position, completed_at) on public.checklist_items to authenticated;
grant delete on public.task_requirements to authenticated;

alter table public.requirements enable row level security;
alter table public.tasks enable row level security;
alter table public.checklist_items enable row level security;
alter table public.task_requirements enable row level security;
alter table public.project_comments enable row level security;

create policy requirements_read on public.requirements for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy requirements_create on public.requirements for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy requirements_update on public.requirements for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));

create policy tasks_read on public.tasks for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy tasks_create on public.tasks for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and creator_id = (select auth.jwt()->>'sub'));
create policy tasks_update on public.tasks for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));

create policy checklist_read on public.checklist_items for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy checklist_create on public.checklist_items for insert to authenticated
  with check (private.can_edit_workspace(workspace_id));
create policy checklist_update on public.checklist_items for update to authenticated
  using (private.can_edit_workspace(workspace_id)) with check (private.can_edit_workspace(workspace_id));

create policy task_requirements_read on public.task_requirements for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy task_requirements_create on public.task_requirements for insert to authenticated
  with check (private.can_edit_workspace(workspace_id));
create policy task_requirements_delete on public.task_requirements for delete to authenticated
  using (private.can_edit_workspace(workspace_id));

create policy comments_read on public.project_comments for select to authenticated
  using (private.is_workspace_member(workspace_id));
create policy comments_create on public.project_comments for insert to authenticated
  with check (private.can_edit_workspace(workspace_id) and author_id = (select auth.jwt()->>'sub'));
