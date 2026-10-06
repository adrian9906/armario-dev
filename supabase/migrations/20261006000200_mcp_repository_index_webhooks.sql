-- A GitHub push may only create one repository-index job per delivery.
create unique index github_sync_jobs_mcp_index_delivery_idx
  on public.github_sync_jobs ((payload ->> 'deliveryId'))
  where operation = 'mcp_repository_index' and payload ? 'deliveryId';
