-- Create ideas through a server-only function that verifies workspace access.

create function public.create_workspace_idea(
  actor_id text,
  target_workspace_id uuid,
  idea_title text,
  idea_description text,
  idea_kind text,
  idea_tags text[]
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare created_id uuid;
begin
  if not exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace_id
      and user_id = actor_id
      and role in ('owner', 'admin', 'editor')
  ) then
    raise exception 'Not allowed to create ideas in this workspace' using errcode = '42501';
  end if;
  if idea_title is null or char_length(trim(idea_title)) not between 1 and 160
     or coalesce(char_length(idea_description), 0) > 10000
     or idea_kind not in ('web', 'mobile', 'frontend', 'backend', 'mixed', 'other', 'undecided')
     or coalesce(cardinality(idea_tags), 0) > 12
     or exists (select 1 from unnest(coalesce(idea_tags, '{}'::text[])) tag where char_length(tag) > 30)
  then
    raise exception 'Invalid idea' using errcode = '22023';
  end if;

  insert into public.ideas (workspace_id, author_id, title, description, kind, tags)
  values (
    target_workspace_id,
    actor_id,
    trim(idea_title),
    coalesce(idea_description, ''),
    idea_kind,
    coalesce(idea_tags, '{}'::text[])
  ) returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.create_workspace_idea(text, uuid, text, text, text, text[])
  from public, anon, authenticated;
grant execute on function public.create_workspace_idea(text, uuid, text, text, text, text[])
  to service_role;
