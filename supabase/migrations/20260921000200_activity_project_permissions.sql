-- Phase 5.1 and 5.2: activity, in-app notifications and project-level access.

alter table public.projects
  add column visibility text not null default 'workspace'
  check (visibility in ('workspace', 'private', 'restricted'));

create table public.project_memberships (
  project_id uuid not null,
  workspace_id uuid not null,
  user_id text not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('manager', 'editor', 'contributor', 'viewer')),
  added_by text not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, user_id),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade,
  foreign key (workspace_id, user_id) references public.workspace_memberships(workspace_id, user_id) on delete cascade
);
create index project_memberships_user_idx on public.project_memberships (user_id, project_id);
create trigger project_memberships_updated_at before update on public.project_memberships
  for each row execute function private.set_updated_at();

-- Workspace owners/admins and the creator can always manage a project.
-- Workspace visibility inherits the workspace role; restricted visibility uses explicit memberships.
create function private.project_role(target_project_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when p.creator_id = (select auth.jwt()->>'sub') then 'manager'
    when private.workspace_role(p.workspace_id) in ('owner', 'admin') then 'manager'
    when p.visibility = 'workspace' then
      case private.workspace_role(p.workspace_id)
        when 'editor' then 'editor'
        when 'viewer' then 'viewer'
        else null
      end
    when p.visibility = 'restricted' then pm.role
    else null
  end
  from public.projects p
  left join public.project_memberships pm
    on pm.project_id = p.id and pm.user_id = (select auth.jwt()->>'sub')
  where p.id = target_project_id
  limit 1;
$$;

create function private.can_view_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.project_role(target_project_id) is not null;
$$;

create function private.can_edit_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.project_role(target_project_id) in ('manager', 'editor'), false);
$$;

create function private.can_comment_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.project_role(target_project_id) in ('manager', 'editor', 'contributor'), false);
$$;

create function private.can_manage_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.project_role(target_project_id) = 'manager', false);
$$;

create function private.can_work_on_task(target_task_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.tasks t
    where t.id = target_task_id
      and (private.can_edit_project(t.project_id)
        or (private.project_role(t.project_id) = 'contributor'
          and t.assignee_id = (select auth.jwt()->>'sub')))
  );
$$;

revoke all on function private.project_role(uuid), private.can_view_project(uuid),
  private.can_edit_project(uuid), private.can_comment_project(uuid),
  private.can_manage_project(uuid), private.can_work_on_task(uuid)
  from public, anon, authenticated;
grant execute on function private.project_role(uuid), private.can_view_project(uuid),
  private.can_edit_project(uuid), private.can_comment_project(uuid),
  private.can_manage_project(uuid), private.can_work_on_task(uuid) to authenticated;

-- Editors may edit project details, but visibility belongs to project managers.
create function private.guard_project_visibility()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.visibility is distinct from old.visibility and not private.can_manage_project(old.id) then
    raise exception 'Only project managers can change visibility' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger project_visibility_guard before update of visibility on public.projects
  for each row execute function private.guard_project_visibility();

-- Contributors can move an assigned task through the workflow, but cannot rewrite its definition.
create function private.guard_contributor_task_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.can_edit_project(old.project_id) then return new; end if;
  if private.project_role(old.project_id) = 'contributor'
    and old.assignee_id = (select auth.jwt()->>'sub')
    and new.title = old.title
    and new.description = old.description
    and new.priority = old.priority
    and new.assignee_id is not distinct from old.assignee_id
    and new.due_date is not distinct from old.due_date
    and new.start_date is not distinct from old.start_date
    and new.position = old.position then
    return new;
  end if;
  raise exception 'Project access does not allow this task change' using errcode = '42501';
end;
$$;
create trigger contributor_task_update_guard before update on public.tasks
  for each row execute function private.guard_contributor_task_update();

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  actor_id text references public.profiles(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'status_changed', 'deleted', 'access_changed')),
  entity_type text not null check (entity_type in ('idea', 'project', 'task', 'requirement', 'comment', 'technology', 'decision', 'diagram', 'project_member')),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index activity_workspace_created_idx on public.activity_events (workspace_id, created_at desc);
create index activity_project_created_idx on public.activity_events (project_id, created_at desc) where project_id is not null;

create table public.notification_preferences (
  workspace_id uuid not null,
  user_id text not null,
  assignments boolean not null default true,
  comments boolean not null default true,
  project_access boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (workspace_id, user_id) references public.workspace_memberships(workspace_id, user_id) on delete cascade
);
create trigger notification_preferences_updated_at before update on public.notification_preferences
  for each row execute function private.set_updated_at();

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  recipient_id text not null references public.profiles(id) on delete cascade,
  actor_id text references public.profiles(id) on delete set null,
  type text not null check (type in ('assignment', 'comment', 'project_access')),
  title text not null check (char_length(title) between 1 and 180),
  body text not null default '' check (char_length(body) <= 500),
  href text not null default '' check (char_length(href) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (project_id, workspace_id) references public.projects(id, workspace_id) on delete cascade
);
create index notifications_recipient_created_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id, workspace_id, created_at desc) where read_at is null;

create function private.record_activity()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  row_data jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  previous_data jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  event_action text;
  target_project uuid;
  target_entity uuid;
begin
  target_project := nullif(coalesce(row_data->>'project_id', case when tg_argv[0] = 'project' then row_data->>'id' end), '')::uuid;
  target_entity := nullif(coalesce(row_data->>'id', row_data->>'project_id'), '')::uuid;
  event_action := case
    when tg_argv[0] = 'project_member' then 'access_changed'
    when tg_op = 'INSERT' then 'created'
    when tg_op = 'DELETE' then 'deleted'
    when row_data->>'status' is distinct from previous_data->>'status' then 'status_changed'
    else 'updated'
  end;
  insert into public.activity_events (workspace_id, project_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    (row_data->>'workspace_id')::uuid,
    target_project,
    nullif(auth.jwt()->>'sub', ''),
    event_action,
    tg_argv[0],
    target_entity,
    jsonb_strip_nulls(jsonb_build_object(
      'label', left(coalesce(row_data->>'title', row_data->>'name', row_data->>'content', ''), 180),
      'status', row_data->>'status',
      'previous_status', previous_data->>'status',
      'user_id', row_data->>'user_id',
      'role', row_data->>'role'
    ))
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create function private.create_notification(
  target_workspace uuid, target_project uuid, target_recipient text, notification_type text,
  notification_title text, notification_body text, notification_href text
)
returns void language plpgsql security definer set search_path = '' as $$
declare enabled boolean;
begin
  if target_recipient is null or target_recipient = nullif(auth.jwt()->>'sub', '') then return; end if;
  select case notification_type
    when 'assignment' then p.assignments
    when 'comment' then p.comments
    when 'project_access' then p.project_access
    else true end into enabled
  from public.notification_preferences p
  where p.workspace_id = target_workspace and p.user_id = target_recipient;
  if coalesce(enabled, true) then
    insert into public.notifications (workspace_id, project_id, recipient_id, actor_id, type, title, body, href)
    values (target_workspace, target_project, target_recipient, nullif(auth.jwt()->>'sub', ''),
      notification_type, notification_title, notification_body, notification_href);
  end if;
end;
$$;

create function private.notify_task_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    perform private.create_notification(new.workspace_id, new.project_id, new.assignee_id, 'assignment',
      'Nueva tarea asignada', new.title, '/projects/' || new.project_id || '/tasks/' || new.id);
  end if;
  return new;
end;
$$;
create trigger task_assignment_notification after insert or update of assignee_id on public.tasks
  for each row execute function private.notify_task_assignment();

create function private.notify_project_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare recipient text; target_title text;
begin
  if new.task_id is not null then
    select assignee_id, title into recipient, target_title from public.tasks where id = new.task_id;
  else
    select creator_id, title into recipient, target_title from public.requirements where id = new.requirement_id;
  end if;
  perform private.create_notification(new.workspace_id, new.project_id, recipient, 'comment',
    'Nuevo comentario', coalesce(target_title, 'En un elemento del proyecto'),
    case when new.task_id is not null
      then '/projects/' || new.project_id || '/tasks/' || new.task_id
      else '/projects/' || new.project_id || '/requirements/' || new.requirement_id end);
  return new;
end;
$$;
create trigger project_comment_notification after insert on public.project_comments
  for each row execute function private.notify_project_comment();

create function private.notify_project_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
declare project_title text;
begin
  select title into project_title from public.projects where id = new.project_id;
  perform private.create_notification(new.workspace_id, new.project_id, new.user_id, 'project_access',
    'Acceso a un proyecto', coalesce(project_title, 'Proyecto'), '/projects/' || new.project_id);
  return new;
end;
$$;
create trigger project_membership_notification after insert on public.project_memberships
  for each row execute function private.notify_project_membership();

create trigger ideas_activity after insert or update or delete on public.ideas
  for each row execute function private.record_activity('idea');
create trigger projects_activity after insert or update or delete on public.projects
  for each row execute function private.record_activity('project');
create trigger tasks_activity after insert or update or delete on public.tasks
  for each row execute function private.record_activity('task');
create trigger requirements_activity after insert or update or delete on public.requirements
  for each row execute function private.record_activity('requirement');
create trigger comments_activity after insert or delete on public.project_comments
  for each row execute function private.record_activity('comment');
create trigger technologies_activity after insert or update or delete on public.project_technologies
  for each row execute function private.record_activity('technology');
create trigger decisions_activity after insert or update or delete on public.architecture_decisions
  for each row execute function private.record_activity('decision');
create trigger diagrams_activity after insert or update or delete on public.project_diagrams
  for each row execute function private.record_activity('diagram');
create trigger project_memberships_activity after insert or update or delete on public.project_memberships
  for each row execute function private.record_activity('project_member');

revoke all on public.project_memberships, public.activity_events,
  public.notifications, public.notification_preferences from public, anon, authenticated;
grant select, insert, update, delete on public.project_memberships to authenticated;
grant select on public.activity_events to authenticated;
grant select, update (read_at), delete on public.notifications to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant update (visibility) on public.projects to authenticated;

alter table public.project_memberships enable row level security;
alter table public.activity_events enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;

create policy project_memberships_read on public.project_memberships for select to authenticated
  using (private.can_view_project(project_id));
create policy project_memberships_create on public.project_memberships for insert to authenticated
  with check (private.can_manage_project(project_id)
    and private.is_workspace_member(workspace_id)
    and added_by = (select auth.jwt()->>'sub'));
create policy project_memberships_update on public.project_memberships for update to authenticated
  using (private.can_manage_project(project_id)) with check (private.can_manage_project(project_id));
create policy project_memberships_delete on public.project_memberships for delete to authenticated
  using (private.can_manage_project(project_id));

create policy activity_read on public.activity_events for select to authenticated
  using (private.is_workspace_member(workspace_id)
    and (project_id is null or private.can_view_project(project_id)));
create policy notifications_read on public.notifications for select to authenticated
  using (recipient_id = (select auth.jwt()->>'sub'));
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.jwt()->>'sub'))
  with check (recipient_id = (select auth.jwt()->>'sub'));
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_id = (select auth.jwt()->>'sub'));
create policy notification_preferences_read on public.notification_preferences for select to authenticated
  using (user_id = (select auth.jwt()->>'sub'));
create policy notification_preferences_create on public.notification_preferences for insert to authenticated
  with check (user_id = (select auth.jwt()->>'sub') and private.is_workspace_member(workspace_id));
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (user_id = (select auth.jwt()->>'sub')) with check (user_id = (select auth.jwt()->>'sub'));

-- Replace workspace-wide project policies with project-aware policies.
drop policy projects_read_member on public.projects;
drop policy projects_update_editor on public.projects;
create policy projects_read_access on public.projects for select to authenticated
  using (private.can_view_project(id));
create policy projects_update_access on public.projects for update to authenticated
  using (private.can_edit_project(id)) with check (private.can_edit_project(id));

drop policy requirements_read on public.requirements;
drop policy requirements_create on public.requirements;
drop policy requirements_update on public.requirements;
create policy requirements_read on public.requirements for select to authenticated using (private.can_view_project(project_id));
create policy requirements_create on public.requirements for insert to authenticated
  with check (private.can_edit_project(project_id) and creator_id = (select auth.jwt()->>'sub'));
create policy requirements_update on public.requirements for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));

drop policy tasks_read on public.tasks;
drop policy tasks_create on public.tasks;
drop policy tasks_update on public.tasks;
create policy tasks_read on public.tasks for select to authenticated using (private.can_view_project(project_id));
create policy tasks_create on public.tasks for insert to authenticated
  with check (private.can_edit_project(project_id) and creator_id = (select auth.jwt()->>'sub'));
create policy tasks_update on public.tasks for update to authenticated
  using (private.can_work_on_task(id)) with check (private.can_work_on_task(id));

drop policy checklist_read on public.checklist_items;
drop policy checklist_create on public.checklist_items;
drop policy checklist_update on public.checklist_items;
create policy checklist_read on public.checklist_items for select to authenticated using (private.can_view_project(project_id));
create policy checklist_create on public.checklist_items for insert to authenticated with check (private.can_work_on_task(task_id));
create policy checklist_update on public.checklist_items for update to authenticated
  using (private.can_work_on_task(task_id)) with check (private.can_work_on_task(task_id));

drop policy task_requirements_read on public.task_requirements;
drop policy task_requirements_create on public.task_requirements;
drop policy task_requirements_delete on public.task_requirements;
create policy task_requirements_read on public.task_requirements for select to authenticated using (private.can_view_project(project_id));
create policy task_requirements_create on public.task_requirements for insert to authenticated with check (private.can_edit_project(project_id));
create policy task_requirements_delete on public.task_requirements for delete to authenticated using (private.can_edit_project(project_id));

drop policy comments_read on public.project_comments;
drop policy comments_create on public.project_comments;
create policy comments_read on public.project_comments for select to authenticated using (private.can_view_project(project_id));
create policy comments_create on public.project_comments for insert to authenticated
  with check (private.can_comment_project(project_id) and author_id = (select auth.jwt()->>'sub'));

drop policy project_technologies_read on public.project_technologies;
drop policy project_technologies_create on public.project_technologies;
drop policy project_technologies_update on public.project_technologies;
drop policy project_technologies_delete on public.project_technologies;
create policy project_technologies_read on public.project_technologies for select to authenticated using (private.can_view_project(project_id));
create policy project_technologies_create on public.project_technologies for insert to authenticated
  with check (private.can_edit_project(project_id) and creator_id = (select auth.jwt()->>'sub'));
create policy project_technologies_update on public.project_technologies for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy project_technologies_delete on public.project_technologies for delete to authenticated using (private.can_edit_project(project_id));

drop policy architecture_decisions_read on public.architecture_decisions;
drop policy architecture_decisions_create on public.architecture_decisions;
drop policy architecture_decisions_update on public.architecture_decisions;
drop policy architecture_decisions_delete on public.architecture_decisions;
create policy architecture_decisions_read on public.architecture_decisions for select to authenticated using (private.can_view_project(project_id));
create policy architecture_decisions_create on public.architecture_decisions for insert to authenticated
  with check (private.can_edit_project(project_id) and creator_id = (select auth.jwt()->>'sub'));
create policy architecture_decisions_update on public.architecture_decisions for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy architecture_decisions_delete on public.architecture_decisions for delete to authenticated using (private.can_edit_project(project_id));

drop policy project_diagrams_read on public.project_diagrams;
drop policy project_diagrams_create on public.project_diagrams;
drop policy project_diagrams_update on public.project_diagrams;
drop policy project_diagrams_delete on public.project_diagrams;
create policy project_diagrams_read on public.project_diagrams for select to authenticated using (private.can_view_project(project_id));
create policy project_diagrams_create on public.project_diagrams for insert to authenticated
  with check (private.can_edit_project(project_id) and creator_id = (select auth.jwt()->>'sub'));
create policy project_diagrams_update on public.project_diagrams for update to authenticated
  using (private.can_edit_project(project_id)) with check (private.can_edit_project(project_id));
create policy project_diagrams_delete on public.project_diagrams for delete to authenticated using (private.can_edit_project(project_id));

-- Existing ordering RPCs are security-definer functions, so they must enforce project access themselves.
create or replace function public.move_project_task(target_task_id uuid, direction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare task_row public.tasks%rowtype; neighbor_id uuid; neighbor_position integer;
begin
  if direction not in ('up', 'down') then raise exception 'Invalid direction' using errcode = '22023'; end if;
  select * into task_row from public.tasks where id = target_task_id for update;
  if not found or not private.can_edit_project(task_row.project_id) then
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

create or replace function public.move_project_requirement(target_requirement_id uuid, direction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare requirement_row public.requirements%rowtype; neighbor_id uuid; neighbor_position integer;
begin
  if direction not in ('up', 'down') then raise exception 'Invalid direction' using errcode = '22023'; end if;
  select * into requirement_row from public.requirements where id = target_requirement_id for update;
  if not found or not private.can_edit_project(requirement_row.project_id) then
    raise exception 'Requirement unavailable' using errcode = '42501';
  end if;
  if direction = 'up' then
    select id, position into neighbor_id, neighbor_position from public.requirements
      where project_id = requirement_row.project_id and status = 'active' and position < requirement_row.position
      order by position desc limit 1 for update;
  else
    select id, position into neighbor_id, neighbor_position from public.requirements
      where project_id = requirement_row.project_id and status = 'active' and position > requirement_row.position
      order by position asc limit 1 for update;
  end if;
  if neighbor_id is null then return false; end if;
  update public.requirements set position = neighbor_position where id = requirement_row.id;
  update public.requirements set position = requirement_row.position where id = neighbor_id;
  return true;
end;
$$;
