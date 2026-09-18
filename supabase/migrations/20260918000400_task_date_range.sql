-- A task can now span a planned start and end date.
alter table public.tasks
  add column start_date date,
  add constraint tasks_date_range_order check (
    start_date is null or due_date is null or start_date <= due_date
  );

grant update (start_date) on public.tasks to authenticated;
