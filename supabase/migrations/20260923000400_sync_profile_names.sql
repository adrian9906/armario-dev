-- Keep the collaborative profile name aligned with the current Clerk name.

create or replace function public.ensure_personal_workspace(chosen_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  requester text := nullif(auth.jwt()->>'sub', '');
  workspace_id uuid;
  safe_name text := left(coalesce(nullif(trim(chosen_name), ''), 'Creador'), 120);
begin
  if requester is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  insert into public.profiles (id, display_name)
  values (requester, safe_name)
  on conflict (id) do update
    set display_name = excluded.display_name
    where public.profiles.display_name is distinct from excluded.display_name;

  insert into public.workspaces (name, owner_id, is_personal)
  values ('Mi espacio', requester, true)
  on conflict do nothing;

  select w.id into workspace_id from public.workspaces w
  where w.owner_id = requester and w.is_personal;
  return workspace_id;
end;
$$;

revoke all on function public.ensure_personal_workspace(text) from public, anon;
grant execute on function public.ensure_personal_workspace(text) to authenticated;
