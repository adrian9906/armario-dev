-- Create the task and its initial checklist atomically under the caller's RLS policies.
create function public.create_task_with_checklist(
  target_project_id uuid,
  task_title text,
  task_description text,
  task_status text,
  task_priority text,
  target_assignee_id text,
  target_start_date date,
  target_due_date date,
  checklist_contents text[]
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare target_workspace_id uuid; created_task_id uuid;
begin
  if checklist_contents is not null and cardinality(checklist_contents) > 30 then
    raise exception 'Too many checklist items' using errcode = '22023';
  end if;
  select workspace_id into target_workspace_id from public.projects where id = target_project_id;
  if not found then raise exception 'Project unavailable' using errcode = '42501'; end if;

  insert into public.tasks (
    workspace_id, project_id, creator_id, title, description, status, priority,
    assignee_id, start_date, due_date
  ) values (
    target_workspace_id, target_project_id, auth.jwt()->>'sub', task_title,
    task_description, task_status, task_priority, target_assignee_id,
    target_start_date, target_due_date
  ) returning id into created_task_id;

  insert into public.checklist_items (workspace_id, project_id, task_id, content, position)
    select target_workspace_id, target_project_id, created_task_id, item.content, item.ordinal::integer
    from unnest(checklist_contents) with ordinality as item(content, ordinal);

  return created_task_id;
end;
$$;
revoke all on function public.create_task_with_checklist(uuid, text, text, text, text, text, date, date, text[]) from public, anon;
grant execute on function public.create_task_with_checklist(uuid, text, text, text, text, text, date, date, text[]) to authenticated;
