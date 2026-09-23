-- Workspace invitations verified with a six-digit, per-workspace code.
-- The code is never stored in plain text and five failed attempts revoke it.

alter table public.workspace_invitations
  add column if not exists attempt_count integer not null default 0
    check (attempt_count between 0 and 5),
  add column if not exists sent_at timestamptz,
  add column if not exists delivery_id text,
  add column if not exists verified_at timestamptz;

-- Previous invitations used a bearer token in the URL. They cannot be safely
-- converted to a numeric code, so administrators must send them again.
update public.workspace_invitations
set status = 'revoked'
where status = 'pending';

create unique index if not exists workspace_invitations_one_pending_idx
  on public.workspace_invitations (workspace_id, email)
  where status = 'pending';

drop function if exists public.accept_workspace_invitation(text, text, text, text);

create or replace function public.create_workspace_invitation(
  actor_id text, target_workspace_id uuid, invited_email text, invited_role text, new_token_hash text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invitation_id uuid;
begin
  if not exists (
    select 1 from public.workspace_memberships
    where workspace_id = target_workspace_id and user_id = actor_id and role in ('owner', 'admin')
  ) then raise exception 'Not allowed to invite to this workspace' using errcode = '42501'; end if;
  if invited_email is null or invited_email <> lower(trim(invited_email))
     or invited_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or char_length(invited_email) > 254
     or invited_role not in ('admin', 'editor', 'viewer')
     or new_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid invitation' using errcode = '22023';
  end if;
  if (select count(*) from public.workspace_invitations
      where invited_by = actor_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'Invitation limit reached' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(target_workspace_id::text),
    pg_catalog.hashtext(invited_email)
  );
  update public.workspace_invitations set status = 'revoked'
    where workspace_id = target_workspace_id and email = invited_email and status = 'pending';
  insert into public.workspace_invitations (
    workspace_id, email, role, token_hash, invited_by, attempt_count, expires_at
  ) values (
    target_workspace_id, invited_email, invited_role, new_token_hash, actor_id, 0, now() + interval '7 days'
  ) returning id into invitation_id;
  return invitation_id;
end;
$$;

create or replace function public.mark_workspace_invitation_sent(
  actor_id text, invitation_id uuid, provider_delivery_id text
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.workspace_invitations invitation
    join public.workspace_memberships membership on membership.workspace_id = invitation.workspace_id
    where invitation.id = invitation_id and membership.user_id = actor_id
      and membership.role in ('owner', 'admin')
  ) then raise exception 'Not allowed to update this invitation' using errcode = '42501'; end if;
  update public.workspace_invitations
  set sent_at = now(), delivery_id = left(provider_delivery_id, 255)
  where id = invitation_id and status = 'pending';
  return found;
end;
$$;

create function public.verify_workspace_invitation_code(
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
     or invitation_id is null or raw_code !~ '^[0-9]{6}$' then
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

  if invitation.token_hash <> encode(extensions.digest(raw_code, 'sha256'), 'hex') then
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

revoke all on function public.create_workspace_invitation(text, uuid, text, text, text)
  from public, anon, authenticated;
revoke all on function public.mark_workspace_invitation_sent(text, uuid, text)
  from public, anon, authenticated;
revoke all on function public.verify_workspace_invitation_code(text, text, text, uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_workspace_invitation(text, uuid, text, text, text)
  to service_role;
grant execute on function public.mark_workspace_invitation_sent(text, uuid, text)
  to service_role;
grant execute on function public.verify_workspace_invitation_code(text, text, text, uuid, text)
  to service_role;
