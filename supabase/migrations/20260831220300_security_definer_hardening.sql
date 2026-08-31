-- Forward-only SECURITY DEFINER / EXECUTE hardening.
-- Apply after 20260831220200_github_webhook_hardening.sql.
-- Do not modify earlier migrations.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'display_name',
      pg_catalog.split_part(new.email, '@', 1),
      'user'
    ),
    coalesce(new.raw_user_meta_data ->> 'locale', 'ko')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function public.assert_active_project_repository()
returns trigger
language plpgsql
security invoker
set search_path = ''
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
set search_path = ''
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

create or replace function public.owns_project(p_project_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
set search_path = ''
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
    'mock-' || p_owner || '-' || p_repo_name || '-' || pg_catalog.gen_random_uuid()::text,
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

create or replace function public.owns_github_installation(p_installation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.github_installations
    where id = p_installation_id
      and user_id = (select auth.uid())
  );
$$;

create or replace function public.prevent_github_install_claim_rebind()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id
    or new.github_external_installation_id is distinct from old.github_external_installation_id
    or new.nonce is distinct from old.nonce
  then
    raise exception 'github install claim identity cannot change';
  end if;
  if old.consumed_at is not null then
    raise exception 'github install claim already consumed';
  end if;
  return new;
end;
$$;

create or replace function public.assert_github_installation_claimed()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.github_install_claims c
    where c.user_id = new.user_id
      and c.github_external_installation_id = new.github_external_installation_id
      and c.consumed_at is not null
      and c.consumed_at > pg_catalog.now() - interval '15 minutes'
  ) then
    raise exception 'github installation requires a consumed ownership claim';
  end if;
  return new;
end;
$$;

create or replace function public.link_project_repository(
  p_project_id uuid,
  p_repository_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects%rowtype;
  v_repo public.repositories%rowtype;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id
    and user_id = v_user_id;
  if not found then
    raise exception 'project not found';
  end if;

  select * into v_repo
  from public.repositories
  where id = p_repository_id
    and user_id = v_user_id;
  if not found then
    raise exception 'repository not found';
  end if;

  if v_repo.github_installation_id is not null
     and not public.owns_github_installation(v_repo.github_installation_id) then
    raise exception 'installation not owned';
  end if;

  update public.project_repositories
  set unlinked_at = pg_catalog.now()
  where project_id = p_project_id
    and unlinked_at is null
    and repository_id is distinct from p_repository_id;

  insert into public.project_repositories (
    project_id, repository_id, role, linked_at, unlinked_at
  )
  values (p_project_id, p_repository_id, 'primary', pg_catalog.now(), null)
  on conflict (project_id, repository_id) do update
    set unlinked_at = null,
        role = 'primary';

  update public.projects
  set active_repository_id = p_repository_id,
      analysis_branch = v_repo.default_branch,
      updated_at = pg_catalog.now()
  where id = p_project_id
    and user_id = v_user_id;
end;
$$;

create or replace function public.unlink_project_primary_repository(
  p_project_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.projects
    where id = p_project_id
      and user_id = v_user_id
  ) then
    raise exception 'project not found';
  end if;

  update public.project_repositories
  set unlinked_at = pg_catalog.now()
  where project_id = p_project_id
    and unlinked_at is null;

  update public.projects
  set active_repository_id = null,
      status = 'disconnected',
      updated_at = pg_catalog.now()
  where id = p_project_id
    and user_id = v_user_id;
end;
$$;

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

do $seed$
begin
  if pg_catalog.to_regprocedure('public.seed_buildmirror_demo(uuid)') is not null then
    execute $ddl$alter function public.seed_buildmirror_demo(uuid) security invoker$ddl$;
    execute $ddl$alter function public.seed_buildmirror_demo(uuid) set search_path = ''$ddl$;
    execute $ddl$revoke all on function public.seed_buildmirror_demo(uuid) from public, anon, authenticated, service_role$ddl$;
  end if;
end;
$seed$;

revoke all on function public.set_updated_at() from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.assert_active_project_repository() from public, anon, authenticated, service_role;
revoke all on function public.assert_snapshot_repository_link() from public, anon, authenticated, service_role;
revoke all on function public.prevent_github_install_claim_rebind() from public, anon, authenticated, service_role;
revoke all on function public.assert_github_installation_claimed() from public, anon, authenticated, service_role;
revoke all on function public.seed_buildmirror_demo(uuid) from public, anon, authenticated, service_role;

revoke all on function public.owns_project(uuid) from public, anon, authenticated, service_role;
revoke all on function public.owns_repository(uuid) from public, anon, authenticated, service_role;
revoke all on function public.snapshot_in_project(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.linked_project_repository(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.owns_github_installation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_project_with_repository(text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.link_project_repository(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.unlink_project_primary_repository(uuid) from public, anon, authenticated, service_role;

revoke all on function public.claim_github_webhook_delivery(text, text, text, bigint, bigint) from public, anon, authenticated, service_role;
revoke all on function public.finish_github_webhook_delivery(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.apply_github_webhook_installation(bigint, text, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) from public, anon, authenticated, service_role;

grant execute on function public.owns_project(uuid) to authenticated;
grant execute on function public.owns_repository(uuid) to authenticated;
grant execute on function public.snapshot_in_project(uuid, uuid) to authenticated;
grant execute on function public.linked_project_repository(uuid, uuid) to authenticated;
grant execute on function public.owns_github_installation(uuid) to authenticated;
grant execute on function public.create_project_with_repository(text, text, text, text) to authenticated;
grant execute on function public.link_project_repository(uuid, uuid) to authenticated;
grant execute on function public.unlink_project_primary_repository(uuid) to authenticated;

grant execute on function public.claim_github_webhook_delivery(text, text, text, bigint, bigint) to service_role;
grant execute on function public.finish_github_webhook_delivery(text, text, text) to service_role;
grant execute on function public.apply_github_webhook_installation(bigint, text, timestamptz) to service_role;
grant execute on function public.apply_github_webhook_repository_access(bigint, bigint[], boolean, timestamptz) to service_role;
grant execute on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) to service_role;
grant execute on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) to service_role;
