-- Give requirements stable positions and allow adjacent moves within a project.
create function private.assign_requirement_position()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.projects where id = new.project_id and workspace_id = new.workspace_id for update;
  select coalesce(max(position), 0) + 1 into new.position from public.requirements where project_id = new.project_id;
  return new;
end;
$$;
create trigger requirements_position_before_insert before insert on public.requirements
  for each row execute function private.assign_requirement_position();

with ranked as (
  select id, row_number() over (partition by project_id order by created_at, id)::integer as next_position
  from public.requirements
)
update public.requirements as r set position = ranked.next_position from ranked where r.id = ranked.id;

create function public.move_project_requirement(target_requirement_id uuid, direction text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare requirement_row public.requirements%rowtype; neighbor_id uuid; neighbor_position integer;
begin
  if direction not in ('up', 'down') then raise exception 'Invalid direction' using errcode = '22023'; end if;
  select * into requirement_row from public.requirements where id = target_requirement_id for update;
  if not found or not private.can_edit_workspace(requirement_row.workspace_id) then
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
revoke all on function public.move_project_requirement(uuid, text) from public, anon;
grant execute on function public.move_project_requirement(uuid, text) to authenticated;
