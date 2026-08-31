-- GitHub installation repository sync and project linking.
-- Do not store installation access tokens or private keys.
-- Apply after 20260831180000_github_install_claims.sql.
-- Do not modify earlier migrations.

alter type public.repository_connection_status
  add value if not exists 'inaccessible';

alter table public.repositories
  add column if not exists full_name text,
  add column if not exists is_archived boolean not null default false,
  add column if not exists is_disabled boolean not null default false,
  add column if not exists github_permissions jsonb not null default '{}'::jsonb,
  add column if not exists github_pushed_at timestamptz,
  add column if not exists last_synced_at timestamptz;

create index if not exists repositories_github_installation_id_idx
  on public.repositories (github_installation_id)
  where github_installation_id is not null;

create or replace function public.link_project_repository(
  p_project_id uuid,
  p_repository_id uuid
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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
  set unlinked_at = now()
  where project_id = p_project_id
    and unlinked_at is null
    and repository_id is distinct from p_repository_id;

  insert into public.project_repositories (
    project_id, repository_id, role, linked_at, unlinked_at
  )
  values (p_project_id, p_repository_id, 'primary', now(), null)
  on conflict (project_id, repository_id) do update
    set unlinked_at = null,
        role = 'primary';

  update public.projects
  set active_repository_id = p_repository_id,
      analysis_branch = v_repo.default_branch,
      updated_at = now()
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
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
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
  set unlinked_at = now()
  where project_id = p_project_id
    and unlinked_at is null;

  update public.projects
  set active_repository_id = null,
      status = 'disconnected',
      updated_at = now()
  where id = p_project_id
    and user_id = v_user_id;
end;
$$;

revoke all on function public.link_project_repository(uuid, uuid) from public, anon;
grant execute on function public.link_project_repository(uuid, uuid) to authenticated;

revoke all on function public.unlink_project_primary_repository(uuid) from public, anon;
grant execute on function public.unlink_project_primary_repository(uuid) to authenticated;
