-- Allow the conversion dialog to start the project with an edited objective.
create function public.convert_idea_to_project(
  target_idea_id uuid,
  target_kind text,
  selected_modules jsonb,
  target_objective text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  idea public.ideas%rowtype;
  result_id uuid;
  requester text := nullif(auth.jwt()->>'sub', '');
begin
  if requester is null
     or target_kind not in ('web', 'mobile', 'frontend', 'backend', 'mixed', 'other')
     or selected_modules is null
     or jsonb_typeof(selected_modules) <> 'object'
     or not (selected_modules ?& array['frontend', 'backend', 'database', 'auth'])
     or jsonb_typeof(selected_modules->'frontend') <> 'boolean'
     or jsonb_typeof(selected_modules->'backend') <> 'boolean'
     or jsonb_typeof(selected_modules->'database') <> 'boolean'
     or jsonb_typeof(selected_modules->'auth') <> 'boolean'
     or selected_modules - 'frontend' - 'backend' - 'database' - 'auth' <> '{}'::jsonb
     or char_length(coalesce(target_objective, '')) > 10000 then
    raise exception 'Invalid project configuration' using errcode = '22023';
  end if;

  select * into idea from public.ideas where id = target_idea_id for update;
  if not found or not private.can_edit_workspace(idea.workspace_id) then
    raise exception 'Idea unavailable' using errcode = '42501';
  end if;

  select id into result_id from public.projects where origin_idea_id = target_idea_id;
  if result_id is not null then return result_id; end if;
  if idea.status <> 'active' then
    raise exception 'Idea cannot be converted' using errcode = '22023';
  end if;

  insert into public.projects (workspace_id, origin_idea_id, creator_id, title, objective, kind, modules, origin_snapshot)
    values (
      idea.workspace_id,
      idea.id,
      requester,
      idea.title,
      coalesce(trim(target_objective), ''),
      target_kind,
      selected_modules,
      jsonb_build_object('title', idea.title, 'description', idea.description, 'author_id', idea.author_id, 'created_at', idea.created_at)
    )
    returning id into result_id;

  update public.ideas set status = 'converted' where id = idea.id;
  return result_id;
end;
$$;

revoke all on function public.convert_idea_to_project(uuid, text, jsonb, text) from public, anon;
grant execute on function public.convert_idea_to_project(uuid, text, jsonb, text) to authenticated;
