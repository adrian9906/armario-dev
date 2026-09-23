-- Create shared workspaces atomically. Returning a row from a direct insert is
-- incompatible with the read policy until the owner-membership trigger runs.
create function public.create_shared_workspace(chosen_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester text := nullif(auth.jwt()->>'sub', '');
  workspace_id uuid;
  safe_name text := trim(coalesce(chosen_name, ''));
begin
  if requester is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if char_length(safe_name) not between 1 and 120 then
    raise exception 'Workspace name must contain between 1 and 120 characters'
      using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = requester) then
    raise exception 'Profile unavailable' using errcode = '23503';
  end if;

  insert into public.workspaces (name, owner_id, is_personal)
  values (safe_name, requester, false)
  returning id into workspace_id;

  return workspace_id;
end;
$$;

revoke all on function public.create_shared_workspace(text) from public, anon;
grant execute on function public.create_shared_workspace(text) to authenticated;
