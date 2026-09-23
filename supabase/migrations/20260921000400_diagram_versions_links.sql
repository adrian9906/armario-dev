-- Phase 5.3: immutable diagram versions and traceability links.

create table public.project_diagram_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  project_id uuid not null,
  diagram_id uuid not null,
  version_number integer not null check (version_number > 0),
  title text not null check (char_length(title) between 1 and 160),
  kind text not null check (kind in ('flow', 'context', 'container', 'data_model')),
  source text not null check (char_length(source) between 1 and 50000),
  status text not null check (status in ('active', 'archived')),
  change_summary text not null default '' check (char_length(change_summary) <= 500),
  created_by text references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (diagram_id, version_number),
  foreign key (diagram_id, workspace_id, project_id)
    references public.project_diagrams(id, workspace_id, project_id) on delete cascade
);
create index diagram_versions_diagram_idx on public.project_diagram_versions (diagram_id, version_number desc);

insert into public.project_diagram_versions (
  workspace_id, project_id, diagram_id, version_number, title, kind, source, status,
  change_summary, created_by, created_at
)
select workspace_id, project_id, id, 1, title, kind, source, status,
  'Versión inicial', creator_id, created_at
from public.project_diagrams;

create function private.snapshot_diagram_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare next_version integer; summary text;
begin
  if tg_op = 'UPDATE'
    and new.title = old.title and new.kind = old.kind and new.source = old.source and new.status = old.status then
    return new;
  end if;
  select coalesce(max(version_number), 0) + 1 into next_version
    from public.project_diagram_versions where diagram_id = new.id;
  summary := nullif(current_setting('app.diagram_change_summary', true), '');
  insert into public.project_diagram_versions (
    workspace_id, project_id, diagram_id, version_number, title, kind, source, status,
    change_summary, created_by
  ) values (
    new.workspace_id, new.project_id, new.id, next_version, new.title, new.kind, new.source, new.status,
    coalesce(summary, case when tg_op = 'INSERT' then 'Versión inicial' else 'Actualización del diagrama' end),
    coalesce(nullif(auth.jwt()->>'sub', ''), new.creator_id)
  );
  return new;
end;
$$;
create trigger diagram_version_snapshot after insert or update on public.project_diagrams
  for each row execute function private.snapshot_diagram_version();

create function public.update_project_diagram(
  target_diagram_id uuid, diagram_title text, diagram_kind text, diagram_source text,
  diagram_status text, revision_summary text
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare result_id uuid;
begin
  if char_length(coalesce(revision_summary, '')) > 500 then
    raise exception 'Revision summary is too long' using errcode = '22023';
  end if;
  perform set_config('app.diagram_change_summary', coalesce(nullif(trim(revision_summary), ''), 'Actualización del diagrama'), true);
  update public.project_diagrams
    set title = diagram_title, kind = diagram_kind, source = diagram_source, status = diagram_status
    where id = target_diagram_id
    returning id into result_id;
  if result_id is null then raise exception 'Diagram unavailable' using errcode = '42501'; end if;
  return result_id;
end;
$$;
revoke all on function public.update_project_diagram(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.update_project_diagram(uuid, text, text, text, text, text) to authenticated;

create function public.restore_project_diagram_version(target_version_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare revision public.project_diagram_versions%rowtype; result_id uuid;
begin
  select * into revision from public.project_diagram_versions where id = target_version_id;
  if not found then raise exception 'Version unavailable' using errcode = '42501'; end if;
  perform set_config('app.diagram_change_summary', 'Restaurada desde la versión ' || revision.version_number, true);
  update public.project_diagrams
    set title = revision.title, kind = revision.kind, source = revision.source, status = revision.status
    where id = revision.diagram_id
    returning id into result_id;
  if result_id is null then raise exception 'Diagram unavailable' using errcode = '42501'; end if;
  return result_id;
end;
$$;
revoke all on function public.restore_project_diagram_version(uuid) from public, anon;
grant execute on function public.restore_project_diagram_version(uuid) to authenticated;

create table public.diagram_requirements (
  workspace_id uuid not null,
  project_id uuid not null,
  diagram_id uuid not null,
  requirement_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (diagram_id, requirement_id),
  foreign key (diagram_id, workspace_id, project_id)
    references public.project_diagrams(id, workspace_id, project_id) on delete cascade,
  foreign key (requirement_id, workspace_id, project_id)
    references public.requirements(id, workspace_id, project_id) on delete cascade
);
create index diagram_requirements_requirement_idx on public.diagram_requirements (requirement_id);

create table public.diagram_decisions (
  workspace_id uuid not null,
  project_id uuid not null,
  diagram_id uuid not null,
  decision_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (diagram_id, decision_id),
  foreign key (diagram_id, workspace_id, project_id)
    references public.project_diagrams(id, workspace_id, project_id) on delete cascade,
  foreign key (decision_id, workspace_id, project_id)
    references public.architecture_decisions(id, workspace_id, project_id) on delete cascade
);
create index diagram_decisions_decision_idx on public.diagram_decisions (decision_id);

revoke all on public.project_diagram_versions, public.diagram_requirements, public.diagram_decisions
  from public, anon, authenticated;
grant select on public.project_diagram_versions to authenticated;
grant select, insert, delete on public.diagram_requirements, public.diagram_decisions to authenticated;

alter table public.project_diagram_versions enable row level security;
alter table public.diagram_requirements enable row level security;
alter table public.diagram_decisions enable row level security;

create policy diagram_versions_read on public.project_diagram_versions for select to authenticated
  using (private.can_view_project(project_id));
create policy diagram_requirements_read on public.diagram_requirements for select to authenticated
  using (private.can_view_project(project_id));
create policy diagram_requirements_create on public.diagram_requirements for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy diagram_requirements_delete on public.diagram_requirements for delete to authenticated
  using (private.can_edit_project(project_id));
create policy diagram_decisions_read on public.diagram_decisions for select to authenticated
  using (private.can_view_project(project_id));
create policy diagram_decisions_create on public.diagram_decisions for insert to authenticated
  with check (private.can_edit_project(project_id));
create policy diagram_decisions_delete on public.diagram_decisions for delete to authenticated
  using (private.can_edit_project(project_id));
