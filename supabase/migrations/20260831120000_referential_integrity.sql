-- Referential integrity, repository-project coupling, and RLS hardening.
-- Apply after 20260831000000_init.sql.
--
-- Before applying, review supabase/verify_integrity.sql for existing violations.
-- Demo seed data from supabase/seed.sql is compatible with these constraints.
--
-- Triggers are used because composite foreign keys cannot express
-- "active_repository_id must currently be linked (unlinked_at is null)
-- and owned by the same user". The snapshot trigger similarly requires
-- an active project_repositories row, not merely a historical pair.
-- Both create_project_with_repository and seed_buildmirror_demo insert a
-- project with active_repository_id before the link row; those checks are
-- DEFERRABLE INITIALLY DEFERRED so they run at transaction commit.

alter table public.analysis_snapshots
  add constraint analysis_snapshots_project_id_id_key
  unique (project_id, id);

alter table public.projects
  drop constraint if exists projects_last_successful_snapshot_id_fkey;

alter table public.projects
  add constraint projects_last_successful_snapshot_project_fkey
  foreign key (id, last_successful_snapshot_id)
  references public.analysis_snapshots (project_id, id)
  on delete set null;

alter table public.scores
  drop constraint if exists scores_snapshot_id_fkey;

alter table public.scores
  add constraint scores_project_snapshot_fkey
  foreign key (project_id, snapshot_id)
  references public.analysis_snapshots (project_id, id)
  on delete cascade;

alter table public.analysis_jobs
  drop constraint if exists analysis_jobs_snapshot_id_fkey;

alter table public.analysis_jobs
  add constraint analysis_jobs_project_snapshot_fkey
  foreign key (project_id, snapshot_id)
  references public.analysis_snapshots (project_id, id)
  on delete set null;

alter table public.project_view_state
  drop constraint if exists project_view_state_snapshot_id_fkey;

alter table public.project_view_state
  add constraint project_view_state_project_snapshot_fkey
  foreign key (project_id, snapshot_id)
  references public.analysis_snapshots (project_id, id)
  on delete set null;

alter table public.analysis_snapshots
  add constraint analysis_snapshots_project_repository_fkey
  foreign key (project_id, repository_id)
  references public.project_repositories (project_id, repository_id);

alter table public.projects
  add constraint projects_active_repository_pair_fkey
  foreign key (id, active_repository_id)
  references public.project_repositories (project_id, repository_id)
  on delete set null
  deferrable initially deferred;

create or replace function public.assert_active_project_repository()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.active_repository_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.project_repositories pr
    join public.repositories r on r.id = pr.repository_id
    where pr.project_id = new.id
      and pr.repository_id = new.active_repository_id
      and pr.unlinked_at is null
      and r.user_id = new.user_id
  ) then
    raise exception 'active_repository_id must be an active repository linked to the same user project';
  end if;

  return new;
end;
$$;

create or replace function public.assert_snapshot_repository_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.project_repositories pr
    where pr.project_id = new.project_id
      and pr.repository_id = new.repository_id
      and pr.unlinked_at is null
  ) then
    raise exception 'analysis snapshot repository must be an active repository of the same project';
  end if;

  return new;
end;
$$;

drop trigger if exists projects_assert_active_repository on public.projects;
create constraint trigger projects_assert_active_repository
after insert or update of active_repository_id, user_id
on public.projects
deferrable initially deferred
for each row
execute function public.assert_active_project_repository();

drop trigger if exists analysis_snapshots_assert_repository_link on public.analysis_snapshots;
create trigger analysis_snapshots_assert_repository_link
before insert or update of project_id, repository_id
on public.analysis_snapshots
for each row
execute function public.assert_snapshot_repository_link();

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
      and user_id = (select auth.uid())
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
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.snapshot_in_project(p_project_id uuid, p_snapshot_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select
    p_snapshot_id is null
    or exists (
      select 1
      from public.analysis_snapshots
      where id = p_snapshot_id
        and project_id = p_project_id
    );
$$;

create or replace function public.linked_project_repository(p_project_id uuid, p_repository_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.project_repositories
    where project_id = p_project_id
      and repository_id = p_repository_id
      and unlinked_at is null
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
  v_user_id uuid := (select auth.uid());
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

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists repositories_select_own on public.repositories;
drop policy if exists repositories_insert_own on public.repositories;
drop policy if exists repositories_update_own on public.repositories;
drop policy if exists repositories_delete_own on public.repositories;
create policy repositories_select_own on public.repositories
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy repositories_insert_own on public.repositories
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy repositories_update_own on public.repositories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy repositories_delete_own on public.repositories
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists projects_select_own on public.projects;
drop policy if exists projects_insert_own on public.projects;
drop policy if exists projects_update_own on public.projects;
drop policy if exists projects_delete_own on public.projects;
create policy projects_select_own on public.projects
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy projects_insert_own on public.projects
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      active_repository_id is null
      or public.owns_repository(active_repository_id)
    )
    and public.snapshot_in_project(id, last_successful_snapshot_id)
  );
create policy projects_update_own on public.projects
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      active_repository_id is null
      or (
        public.owns_repository(active_repository_id)
        and public.linked_project_repository(id, active_repository_id)
      )
    )
    and public.snapshot_in_project(id, last_successful_snapshot_id)
  );
create policy projects_delete_own on public.projects
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists project_repositories_select_own on public.project_repositories;
drop policy if exists project_repositories_insert_own on public.project_repositories;
drop policy if exists project_repositories_update_own on public.project_repositories;
drop policy if exists project_repositories_delete_own on public.project_repositories;
create policy project_repositories_select_own on public.project_repositories
  for select to authenticated
  using (public.owns_project(project_id));
create policy project_repositories_insert_own on public.project_repositories
  for insert to authenticated
  with check (
    public.owns_project(project_id)
    and public.owns_repository(repository_id)
  );
create policy project_repositories_update_own on public.project_repositories
  for update to authenticated
  using (public.owns_project(project_id) and public.owns_repository(repository_id))
  with check (
    public.owns_project(project_id)
    and public.owns_repository(repository_id)
  );
create policy project_repositories_delete_own on public.project_repositories
  for delete to authenticated
  using (public.owns_project(project_id) and public.owns_repository(repository_id));

drop policy if exists analysis_snapshots_select_own on public.analysis_snapshots;
drop policy if exists analysis_snapshots_insert_own on public.analysis_snapshots;
drop policy if exists analysis_snapshots_update_own on public.analysis_snapshots;
drop policy if exists analysis_snapshots_delete_own on public.analysis_snapshots;
create policy analysis_snapshots_select_own on public.analysis_snapshots
  for select to authenticated
  using (public.owns_project(project_id));
create policy analysis_snapshots_insert_own on public.analysis_snapshots
  for insert to authenticated
  with check (
    public.owns_project(project_id)
    and public.linked_project_repository(project_id, repository_id)
  );
create policy analysis_snapshots_update_own on public.analysis_snapshots
  for update to authenticated
  using (public.owns_project(project_id))
  with check (
    public.owns_project(project_id)
    and public.linked_project_repository(project_id, repository_id)
  );
create policy analysis_snapshots_delete_own on public.analysis_snapshots
  for delete to authenticated
  using (public.owns_project(project_id));

drop policy if exists analysis_jobs_select_own on public.analysis_jobs;
drop policy if exists analysis_jobs_insert_own on public.analysis_jobs;
drop policy if exists analysis_jobs_update_own on public.analysis_jobs;
drop policy if exists analysis_jobs_delete_own on public.analysis_jobs;
create policy analysis_jobs_select_own on public.analysis_jobs
  for select to authenticated
  using (public.owns_project(project_id));
create policy analysis_jobs_insert_own on public.analysis_jobs
  for insert to authenticated
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy analysis_jobs_update_own on public.analysis_jobs
  for update to authenticated
  using (public.owns_project(project_id))
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy analysis_jobs_delete_own on public.analysis_jobs
  for delete to authenticated
  using (public.owns_project(project_id));

drop policy if exists scores_select_own on public.scores;
drop policy if exists scores_insert_own on public.scores;
drop policy if exists scores_update_own on public.scores;
drop policy if exists scores_delete_own on public.scores;
create policy scores_select_own on public.scores
  for select to authenticated
  using (public.owns_project(project_id));
create policy scores_insert_own on public.scores
  for insert to authenticated
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy scores_update_own on public.scores
  for update to authenticated
  using (public.owns_project(project_id))
  with check (
    public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy scores_delete_own on public.scores
  for delete to authenticated
  using (public.owns_project(project_id));

drop policy if exists project_view_state_select_own on public.project_view_state;
drop policy if exists project_view_state_insert_own on public.project_view_state;
drop policy if exists project_view_state_update_own on public.project_view_state;
drop policy if exists project_view_state_delete_own on public.project_view_state;
create policy project_view_state_select_own on public.project_view_state
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );
create policy project_view_state_insert_own on public.project_view_state
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy project_view_state_update_own on public.project_view_state
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
    and public.snapshot_in_project(project_id, snapshot_id)
  );
create policy project_view_state_delete_own on public.project_view_state
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );

drop policy if exists notifications_select_own on public.notifications;
drop policy if exists notifications_insert_own on public.notifications;
drop policy if exists notifications_update_own on public.notifications;
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_select_own on public.notifications
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );
create policy notifications_insert_own on public.notifications
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );
create policy notifications_update_own on public.notifications
  for update to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  )
  with check (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );
create policy notifications_delete_own on public.notifications
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and public.owns_project(project_id)
  );

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.assert_active_project_repository() from public, anon, authenticated;
revoke all on function public.assert_snapshot_repository_link() from public, anon, authenticated;

revoke all on function public.owns_project(uuid) from public, anon;
revoke all on function public.owns_repository(uuid) from public, anon;
revoke all on function public.snapshot_in_project(uuid, uuid) from public, anon;
revoke all on function public.linked_project_repository(uuid, uuid) from public, anon;
revoke all on function public.create_project_with_repository(text, text, text, text) from public, anon;
revoke all on function public.seed_buildmirror_demo(uuid) from public, anon;

grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_repository(uuid) to authenticated;
grant execute on function public.snapshot_in_project(uuid, uuid) to authenticated;
grant execute on function public.linked_project_repository(uuid, uuid) to authenticated;
grant execute on function public.create_project_with_repository(text, text, text, text) to authenticated;

-- Demo seed is for the SQL editor (table owner). Authenticated app users
-- should not be able to invoke it from the client.
revoke all on function public.seed_buildmirror_demo(uuid) from public, anon, authenticated;
