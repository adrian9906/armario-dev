-- Keep assignments inside the people who can actually open the project.
create function private.user_can_view_project(target_project_id uuid, target_user_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.projects p
    join public.workspace_memberships wm on wm.workspace_id = p.workspace_id and wm.user_id = target_user_id
    left join public.project_memberships pm on pm.project_id = p.id and pm.user_id = target_user_id
    where p.id = target_project_id
      and (p.creator_id = target_user_id or wm.role in ('owner', 'admin')
        or p.visibility = 'workspace' or (p.visibility = 'restricted' and pm.user_id is not null))
  );
$$;
revoke all on function private.user_can_view_project(uuid, text) from public, anon, authenticated;
grant execute on function private.user_can_view_project(uuid, text) to authenticated;

create or replace function private.validate_task_assignee()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.assignee_id is not null and not private.user_can_view_project(new.project_id, new.assignee_id) then
    raise exception 'Assignee must have access to the project' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- A contributor may complete checklist items on an assigned task without rewriting them.
create function private.guard_contributor_checklist_update()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.can_edit_project(old.project_id) then return new; end if;
  if private.can_work_on_task(old.task_id)
    and new.content = old.content
    and new.position = old.position
    and new.task_id = old.task_id
    and new.project_id = old.project_id
    and new.workspace_id = old.workspace_id then
    return new;
  end if;
  raise exception 'Project access does not allow this checklist change' using errcode = '42501';
end;
$$;
create trigger contributor_checklist_update_guard before update on public.checklist_items
  for each row execute function private.guard_contributor_checklist_update();
