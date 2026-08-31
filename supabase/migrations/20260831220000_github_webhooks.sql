-- GitHub App webhook deliveries and pending analysis job metadata.
-- Do not store webhook secrets, installation tokens, or full payloads.
-- Apply after 20260831200000_github_repository_sync.sql.

alter type public.analysis_job_status
  add value if not exists 'pending';

alter table public.github_installations
  add column if not exists deleted_at timestamptz;

alter table public.analysis_jobs
  add column if not exists repository_id uuid references public.repositories (id) on delete set null,
  add column if not exists trigger_type text not null default 'manual',
  add column if not exists trigger_ref text,
  add column if not exists trigger_sha text,
  add column if not exists github_delivery_id text;

alter table public.analysis_jobs
  drop constraint if exists analysis_jobs_trigger_type_check;

alter table public.analysis_jobs
  add constraint analysis_jobs_trigger_type_check
  check (trigger_type in ('manual', 'github_push', 'mock'));

create unique index if not exists analysis_jobs_github_delivery_project_key
  on public.analysis_jobs (github_delivery_id, project_id)
  where github_delivery_id is not null;

create unique index if not exists analysis_jobs_github_push_sha_key
  on public.analysis_jobs (project_id, repository_id, trigger_sha)
  where trigger_type = 'github_push'
    and trigger_sha is not null
    and repository_id is not null;

create table public.github_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  github_delivery_id text not null,
  github_event text not null,
  action text,
  github_external_installation_id bigint,
  github_repository_id bigint,
  processing_status text not null,
  error_code text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint github_webhook_deliveries_delivery_id_key
    unique (github_delivery_id),
  constraint github_webhook_deliveries_status_check
    check (processing_status in ('received', 'processed', 'ignored', 'failed')),
  constraint github_webhook_deliveries_event_check
    check (
      github_event in (
        'ping',
        'installation',
        'installation_repositories',
        'repository',
        'push',
        'pull_request'
      )
    )
);

create index github_webhook_deliveries_received_at_idx
  on public.github_webhook_deliveries (received_at desc);

alter table public.github_webhook_deliveries enable row level security;

revoke all on table public.github_webhook_deliveries from public, anon, authenticated;
grant all on table public.github_webhook_deliveries to service_role;
