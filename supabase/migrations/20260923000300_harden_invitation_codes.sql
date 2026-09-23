-- Compare a server-side HMAC instead of a plain SHA-256 of the six-digit code.
-- The parameter keeps its original name to preserve the RPC signature, but it
-- now contains the HMAC produced by the Next.js server.

create or replace function public.verify_workspace_invitation_code(
  accepting_user_id text,
  verified_email text,
  display_name text,
  invitation_id uuid,
  raw_code text
)
returns table (
  accepted boolean,
  target_workspace_id uuid,
  result_code text,
  remaining_attempts integer
)
language plpgsql security definer set search_path = '' as $$
declare invitation public.workspace_invitations%rowtype;
declare next_attempt_count integer;
begin
  if accepting_user_id is null or accepting_user_id = '' or verified_email is null
     or invitation_id is null or raw_code !~ '^[a-f0-9]{64}$' then
    return query select false, null::uuid, 'invalid_input'::text, 0;
    return;
  end if;

  select * into invitation from public.workspace_invitations
    where id = invitation_id for update;

  if not found or invitation.status <> 'pending' or invitation.expires_at <= now()
     or invitation.attempt_count >= 5 then
    return query select false, null::uuid, 'unavailable'::text, 0;
    return;
  end if;
  if invitation.email <> lower(trim(verified_email)) then
    return query select false, null::uuid, 'account_mismatch'::text, 5 - invitation.attempt_count;
    return;
  end if;

  if invitation.token_hash <> raw_code then
    next_attempt_count := invitation.attempt_count + 1;
    update public.workspace_invitations
      set attempt_count = next_attempt_count,
          status = case when next_attempt_count >= 5 then 'revoked' else status end
      where id = invitation.id;
    return query select false, null::uuid,
      case when next_attempt_count >= 5 then 'attempts_exhausted' else 'wrong_code' end::text,
      greatest(0, 5 - next_attempt_count);
    return;
  end if;

  insert into public.profiles (id, display_name)
    values (accepting_user_id, left(coalesce(nullif(trim(display_name), ''), 'Creador'), 120))
    on conflict (id) do nothing;
  insert into public.workspace_memberships (workspace_id, user_id, role)
    values (invitation.workspace_id, accepting_user_id, invitation.role)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invitations
    set status = 'accepted', accepted_by = accepting_user_id, verified_at = now()
    where id = invitation.id;

  return query select true, invitation.workspace_id, 'accepted'::text, 5 - invitation.attempt_count;
end;
$$;

revoke all on function public.verify_workspace_invitation_code(text, text, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.verify_workspace_invitation_code(text, text, text, uuid, text)
  to service_role;
