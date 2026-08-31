-- BuildMirror initial schema
-- Auth: Supabase Auth (auth.users)
-- Access: RLS uses auth.uid(), never a client-supplied user_id alone.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_status') then
    create type public.project_status as enum (
      'up_to_date',
      'changes_detected',
      'analyzing',
      'stale',
      'failed',
      'disconnected',
      'archived'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'analysis_snapshot_status') then
    create type public.analysis_snapshot_status as enum (
      'completed',
      'failed',
      'partial'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'analysis_job_type') then
    create type public.analysis_job_type as enum (
      'full',
      'incremental'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'analysis_job_stage') then
    create type public.analysis_job_stage as enum (
      'queued',
      'cloning',
      'installing',
      'analyzing',
      'building',
      'generating_report',
      'completed',
      'failed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'analysis_job_status') then
    create type public.analysis_job_status as enum (
      'queued',
      'running',
      'completed',
      'failed'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'repository_provider') then
    create type public.repository_provider as enum ('mock', 'github');
  end if;
  if not exists (select 1 from pg_type where typname = 'repository_connection_status') then
    create type public.repository_connection_status as enum (
      'connected',
      'disconnected'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'project_repository_role') then
    create type public.project_repository_role as enum ('primary');
  end if;
  if not exists (select 1 from pg_type where typname = 'notification_status') then
    create type public.notification_status as enum ('unread', 'read');
  end if;
  if not exists (select 1 from pg_type where typname = 'data_source') then
    create type public.data_source as enum ('mock', 'estimated', 'confirmed');
  end if;
  if not exists (select 1 from pg_type where typname = 'overall_verdict') then
    create type public.overall_verdict as enum (
      'ship_ready',
      'ship_with_caution',
      'learning_project',
      'not_ready',
      'insufficient_evidence'
    );
  end if;
end
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  skill_level text,
  locale text not null default 'ko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.repositories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider public.repository_provider not null default 'mock',
  provider_id text not null,
  owner text not null,
  name text not null,
  default_branch text not null default 'main',
  head_sha text,
  connection_status public.repository_connection_status not null default 'disconnected',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_id)
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  status public.project_status not null default 'disconnected',
  active_repository_id uuid references public.repositories (id) on delete set null,
  analysis_branch text not null default 'main',
  stored_commit_sha text,
  latest_known_commit_sha text,
  latest_known_at timestamptz,
  last_successful_snapshot_id uuid,
  last_opened_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_name_length check (char_length(name) between 1 and 80)
);

create table if not exists public.project_repositories (
  project_id uuid not null references public.projects (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete cascade,
  role public.project_repository_role not null default 'primary',
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz,
  primary key (project_id, repository_id)
);

create unique index if not exists project_repositories_one_active_primary
  on public.project_repositories (project_id)
  where role = 'primary' and unlinked_at is null;

create table if not exists public.analysis_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  repository_id uuid not null references public.repositories (id) on delete restrict,
  branch text not null,
  commit_sha text not null,
  analysis_engine_version text not null,
  constitution_version text not null,
  status public.analysis_snapshot_status not null,
  data_source public.data_source not null default 'mock',
  summary text,
  learning_tasks jsonb not null default '[]'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (
    project_id,
    repository_id,
    branch,
    commit_sha,
    analysis_engine_version,
    constitution_version
  )
);

alter table public.projects
  drop constraint if exists projects_last_successful_snapshot_id_fkey;

alter table public.projects
  add constraint projects_last_successful_snapshot_id_fkey
  foreign key (last_successful_snapshot_id)
  references public.analysis_snapshots (id)
  on delete set null;

create table if not exists public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  snapshot_id uuid references public.analysis_snapshots (id) on delete set null,
  type public.analysis_job_type not null,
  stage public.analysis_job_stage not null,
  progress integer not null default 0,
  status public.analysis_job_status not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint analysis_jobs_progress_range check (progress between 0 and 100)
);

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  snapshot_id uuid not null references public.analysis_snapshots (id) on delete cascade,
  correctness_value numeric(5, 2),
  correctness_confidence numeric(5, 2),
  correctness_summary text not null default '',
  nativeness_value numeric(5, 2),
  nativeness_confidence numeric(5, 2),
  nativeness_summary text not null default '',
  ownership_value numeric(5, 2),
  ownership_confidence numeric(5, 2),
  ownership_summary text not null default '',
  verdict public.overall_verdict,
  data_source public.data_source not null default 'mock',
  unique (snapshot_id)
);

create table if not exists public.project_view_state (
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  route text not null,
  snapshot_id uuid references public.analysis_snapshots (id) on delete set null,
  filters jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, project_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  type text not null,
  status public.notification_status not null default 'unread',
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_last_opened_idx
  on public.projects (user_id, last_opened_at desc nulls last);
create index if not exists projects_user_status_idx
  on public.projects (user_id, status);
create index if not exists repositories_user_idx
  on public.repositories (user_id);
create index if not exists analysis_snapshots_project_completed_idx
  on public.analysis_snapshots (project_id, completed_at desc nulls last);
create index if not exists analysis_jobs_project_created_idx
  on public.analysis_jobs (project_id, created_at desc);
create index if not exists scores_project_idx
  on public.scores (project_id);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_project_idx
  on public.notifications (project_id, created_at desc);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists repositories_set_updated_at on public.repositories;
create trigger repositories_set_updated_at
before update on public.repositories
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1), 'user'),
    coalesce(new.raw_user_meta_data->>'locale', 'ko')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.projects
    where id = p_project_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.owns_repository(p_repository_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.repositories
    where id = p_repository_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.create_project_with_repository(
  p_name text,
  p_owner text,
  p_repo_name text,
  p_default_branch text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_project_id uuid;
  v_repo_id uuid;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.repositories (
    user_id, provider, provider_id, owner, name, default_branch, connection_status
  )
  values (
    v_user_id,
    'mock',
    'mock-' || p_owner || '-' || p_repo_name || '-' || gen_random_uuid()::text,
    p_owner,
    p_repo_name,
    coalesce(nullif(p_default_branch, ''), 'main'),
    'disconnected'
  )
  returning id into v_repo_id;

  insert into public.projects (
    user_id, name, status, active_repository_id, analysis_branch
  )
  values (
    v_user_id,
    p_name,
    'disconnected',
    v_repo_id,
    coalesce(nullif(p_default_branch, ''), 'main')
  )
  returning id into v_project_id;

  insert into public.project_repositories (project_id, repository_id, role)
  values (v_project_id, v_repo_id, 'primary');

  return v_project_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.repositories enable row level security;
alter table public.projects enable row level security;
alter table public.project_repositories enable row level security;
alter table public.analysis_snapshots enable row level security;
alter table public.analysis_jobs enable row level security;
alter table public.scores enable row level security;
alter table public.project_view_state enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists repositories_select_own on public.repositories;
create policy repositories_select_own on public.repositories
  for select using (auth.uid() = user_id);
drop policy if exists repositories_insert_own on public.repositories;
create policy repositories_insert_own on public.repositories
  for insert with check (auth.uid() = user_id);
drop policy if exists repositories_update_own on public.repositories;
create policy repositories_update_own on public.repositories
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists repositories_delete_own on public.repositories;
create policy repositories_delete_own on public.repositories
  for delete using (auth.uid() = user_id);

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own on public.projects
  for select using (auth.uid() = user_id);
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects
  for insert with check (auth.uid() = user_id);
drop policy if exists projects_update_own on public.projects;
create policy projects_update_own on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own on public.projects
  for delete using (auth.uid() = user_id);

drop policy if exists project_repositories_select_own on public.project_repositories;
create policy project_repositories_select_own on public.project_repositories
  for select using (public.owns_project(project_id));
drop policy if exists project_repositories_insert_own on public.project_repositories;
create policy project_repositories_insert_own on public.project_repositories
  for insert with check (
    public.owns_project(project_id) and public.owns_repository(repository_id)
  );
drop policy if exists project_repositories_update_own on public.project_repositories;
create policy project_repositories_update_own on public.project_repositories
  for update using (public.owns_project(project_id))
  with check (public.owns_project(project_id));
drop policy if exists project_repositories_delete_own on public.project_repositories;
create policy project_repositories_delete_own on public.project_repositories
  for delete using (public.owns_project(project_id));

drop policy if exists analysis_snapshots_select_own on public.analysis_snapshots;
create policy analysis_snapshots_select_own on public.analysis_snapshots
  for select using (public.owns_project(project_id));
drop policy if exists analysis_snapshots_insert_own on public.analysis_snapshots;
create policy analysis_snapshots_insert_own on public.analysis_snapshots
  for insert with check (public.owns_project(project_id));
drop policy if exists analysis_snapshots_update_own on public.analysis_snapshots;
create policy analysis_snapshots_update_own on public.analysis_snapshots
  for update using (public.owns_project(project_id))
  with check (public.owns_project(project_id));
drop policy if exists analysis_snapshots_delete_own on public.analysis_snapshots;
create policy analysis_snapshots_delete_own on public.analysis_snapshots
  for delete using (public.owns_project(project_id));

drop policy if exists analysis_jobs_select_own on public.analysis_jobs;
create policy analysis_jobs_select_own on public.analysis_jobs
  for select using (public.owns_project(project_id));
drop policy if exists analysis_jobs_insert_own on public.analysis_jobs;
create policy analysis_jobs_insert_own on public.analysis_jobs
  for insert with check (public.owns_project(project_id));
drop policy if exists analysis_jobs_update_own on public.analysis_jobs;
create policy analysis_jobs_update_own on public.analysis_jobs
  for update using (public.owns_project(project_id))
  with check (public.owns_project(project_id));
drop policy if exists analysis_jobs_delete_own on public.analysis_jobs;
create policy analysis_jobs_delete_own on public.analysis_jobs
  for delete using (public.owns_project(project_id));

drop policy if exists scores_select_own on public.scores;
create policy scores_select_own on public.scores
  for select using (public.owns_project(project_id));
drop policy if exists scores_insert_own on public.scores;
create policy scores_insert_own on public.scores
  for insert with check (public.owns_project(project_id));
drop policy if exists scores_update_own on public.scores;
create policy scores_update_own on public.scores
  for update using (public.owns_project(project_id))
  with check (public.owns_project(project_id));
drop policy if exists scores_delete_own on public.scores;
create policy scores_delete_own on public.scores
  for delete using (public.owns_project(project_id));

drop policy if exists project_view_state_select_own on public.project_view_state;
create policy project_view_state_select_own on public.project_view_state
  for select using (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists project_view_state_insert_own on public.project_view_state;
create policy project_view_state_insert_own on public.project_view_state
  for insert with check (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists project_view_state_update_own on public.project_view_state;
create policy project_view_state_update_own on public.project_view_state
  for update using (auth.uid() = user_id and public.owns_project(project_id))
  with check (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists project_view_state_delete_own on public.project_view_state;
create policy project_view_state_delete_own on public.project_view_state
  for delete using (auth.uid() = user_id and public.owns_project(project_id));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own on public.notifications
  for insert with check (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id and public.owns_project(project_id))
  with check (auth.uid() = user_id and public.owns_project(project_id));
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
  for delete using (auth.uid() = user_id and public.owns_project(project_id));

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.repositories,
  public.projects,
  public.project_repositories,
  public.analysis_snapshots,
  public.analysis_jobs,
  public.scores,
  public.project_view_state,
  public.notifications
to authenticated;
grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_repository(uuid) to authenticated;
grant execute on function public.create_project_with_repository(text, text, text, text) to authenticated;
