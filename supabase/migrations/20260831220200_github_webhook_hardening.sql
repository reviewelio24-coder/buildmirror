-- Harden webhook SECURITY DEFINER RPCs and keep github_push jobs
-- off the authenticated Data API. Apply after 20260831220100.

alter function public.claim_github_webhook_delivery(text, text, text, bigint, bigint)
  set search_path = '';
alter function public.finish_github_webhook_delivery(text, text, text)
  set search_path = '';
alter function public.apply_github_webhook_installation(bigint, text, timestamptz)
  set search_path = '';
alter function public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz)
  set search_path = '';
alter function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz)
  set search_path = '';
alter function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text)
  set search_path = '';

revoke all on function public.claim_github_webhook_delivery(text, text, text, bigint, bigint) from public, anon, authenticated;
revoke all on function public.finish_github_webhook_delivery(text, text, text) from public, anon, authenticated;
revoke all on function public.apply_github_webhook_installation(bigint, text, timestamptz) from public, anon, authenticated;
revoke all on function public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) from public, anon, authenticated;
revoke all on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) from public, anon, authenticated;

grant execute on function public.claim_github_webhook_delivery(text, text, text, bigint, bigint) to service_role;
grant execute on function public.finish_github_webhook_delivery(text, text, text) to service_role;
grant execute on function public.apply_github_webhook_installation(bigint, text, timestamptz) to service_role;
grant execute on function public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz) to service_role;
grant execute on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) to service_role;
grant execute on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) to service_role;

revoke all on table public.github_webhook_deliveries from public, anon, authenticated;
grant all on table public.github_webhook_deliveries to service_role;

drop policy if exists analysis_jobs_insert_own on public.analysis_jobs;
create policy analysis_jobs_insert_own on public.analysis_jobs
  for insert to authenticated
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
    and coalesce(trigger_type, 'manual') in ('manual', 'mock')
    and github_delivery_id is null
  );

drop policy if exists analysis_jobs_update_own on public.analysis_jobs;
create policy analysis_jobs_update_own on public.analysis_jobs
  for update to authenticated
  using (public.owns_project(project_id))
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
    and coalesce(trigger_type, 'manual') in ('manual', 'mock')
    and github_delivery_id is null
  );

drop policy if exists analysis_jobs_delete_own on public.analysis_jobs;
create policy analysis_jobs_delete_own on public.analysis_jobs
  for delete to authenticated
  using (
    public.owns_project(project_id)
    and coalesce(trigger_type, 'manual') in ('manual', 'mock')
    and github_delivery_id is null
  );
