-- Forward fix: empty search_path makes CASE/INSERT enum literals type as text.
-- Do not edit earlier webhook RPC or hardening migrations.

create or replace function public.upsert_github_webhook_repository(
  p_external_installation_id bigint,
  p_github_repository_id bigint,
  p_owner text,
  p_name text,
  p_full_name text,
  p_html_url text,
  p_default_branch text,
  p_is_private boolean,
  p_is_archived boolean,
  p_is_disabled boolean,
  p_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installation public.github_installations%rowtype;
  v_existing public.repositories%rowtype;
begin
  select * into v_installation
  from public.github_installations
  where github_external_installation_id = p_external_installation_id
    and deleted_at is null
    and suspended_at is null;

  if not found then
    return false;
  end if;

  select * into v_existing
  from public.repositories
  where user_id = v_installation.user_id
    and github_repository_id = p_github_repository_id;

  if found then
    update public.repositories
    set owner = coalesce(p_owner, owner),
        name = coalesce(p_name, name),
        full_name = coalesce(p_full_name, full_name),
        html_url = coalesce(p_html_url, html_url),
        default_branch = coalesce(nullif(p_default_branch, ''), default_branch),
        is_private = coalesce(p_is_private, is_private),
        is_archived = coalesce(p_is_archived, is_archived),
        is_disabled = coalesce(p_is_disabled, is_disabled),
        github_installation_id = v_installation.id,
        connection_status = case
          when coalesce(p_is_disabled, is_disabled) then 'inaccessible'::public.repository_connection_status
          else 'connected'::public.repository_connection_status
        end,
        last_synced_at = p_at,
        updated_at = p_at
    where id = v_existing.id;
    return true;
  end if;

  insert into public.repositories (
    user_id,
    provider,
    provider_id,
    owner,
    name,
    full_name,
    html_url,
    default_branch,
    is_private,
    is_archived,
    is_disabled,
    github_installation_id,
    github_repository_id,
    connection_status,
    last_synced_at
  )
  values (
    v_installation.user_id,
    'github'::public.repository_provider,
    p_github_repository_id::text,
    coalesce(p_owner, 'unknown'),
    coalesce(p_name, 'unknown'),
    p_full_name,
    p_html_url,
    coalesce(nullif(p_default_branch, ''), 'main'),
    coalesce(p_is_private, false),
    coalesce(p_is_archived, false),
    coalesce(p_is_disabled, false),
    v_installation.id,
    p_github_repository_id,
    case
      when coalesce(p_is_disabled, false) then 'inaccessible'::public.repository_connection_status
      else 'connected'::public.repository_connection_status
    end,
    p_at
  );
  return true;
end;
$$;

create or replace function public.enqueue_github_push_analysis_jobs(
  p_delivery_id text,
  p_external_installation_id bigint,
  p_github_repository_id bigint,
  p_trigger_ref text,
  p_trigger_sha text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_installation public.github_installations%rowtype;
  v_repo public.repositories%rowtype;
  v_link record;
  v_created integer := 0;
begin
  if p_trigger_sha is null or p_trigger_sha !~ '^[0-9a-fA-F]{40,64}$' then
    return 0;
  end if;
  if p_trigger_sha ~ '^0+$' then
    return 0;
  end if;

  select * into v_installation
  from public.github_installations
  where github_external_installation_id = p_external_installation_id
    and deleted_at is null
    and suspended_at is null;
  if not found then
    return 0;
  end if;

  select * into v_repo
  from public.repositories
  where github_installation_id = v_installation.id
    and github_repository_id = p_github_repository_id
    and connection_status = 'connected'::public.repository_connection_status
    and coalesce(is_archived, false) = false
    and coalesce(is_disabled, false) = false;
  if not found then
    return 0;
  end if;

  if p_trigger_ref is distinct from ('refs/heads/' || v_repo.default_branch) then
    return 0;
  end if;

  for v_link in
    select pr.project_id
    from public.project_repositories pr
    join public.projects p on p.id = pr.project_id
    where pr.repository_id = v_repo.id
      and pr.unlinked_at is null
      and p.archived_at is null
      and p.user_id = v_repo.user_id
  loop
    insert into public.analysis_jobs (
      project_id,
      repository_id,
      snapshot_id,
      type,
      stage,
      progress,
      status,
      trigger_type,
      trigger_ref,
      trigger_sha,
      github_delivery_id
    )
    values (
      v_link.project_id,
      v_repo.id,
      null,
      'incremental'::public.analysis_job_type,
      'queued'::public.analysis_job_stage,
      0,
      'pending'::public.analysis_job_status,
      'github_push',
      p_trigger_ref,
      p_trigger_sha,
      p_delivery_id
    )
    on conflict do nothing;
    if found then
      v_created := v_created + 1;
    end if;
  end loop;

  return v_created;
end;
$$;

revoke all on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) from public, anon, authenticated, service_role;
grant execute on function public.upsert_github_webhook_repository(bigint, bigint, text, text, text, text, text, boolean, boolean, boolean, timestamptz) to service_role;
grant execute on function public.enqueue_github_push_analysis_jobs(text, bigint, bigint, text, text) to service_role;
