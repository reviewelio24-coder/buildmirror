-- Webhook-only SECURITY DEFINER RPCs.
-- Execute is revoked from public/anon/authenticated and granted only to
-- service_role. These functions never store tokens or full webhook payloads.
-- Apply after 20260831220000_github_webhooks.sql.

create or replace function public.claim_github_webhook_delivery(
  p_delivery_id text,
  p_event text,
  p_action text,
  p_installation_id bigint,
  p_repository_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.github_webhook_deliveries%rowtype;
begin
  if p_delivery_id is null or char_length(p_delivery_id) = 0 or char_length(p_delivery_id) > 128 then
    raise exception 'invalid delivery id';
  end if;

  insert into public.github_webhook_deliveries (
    github_delivery_id,
    github_event,
    action,
    github_external_installation_id,
    github_repository_id,
    processing_status
  )
  values (
    p_delivery_id,
    p_event,
    p_action,
    p_installation_id,
    p_repository_id,
    'received'
  )
  on conflict (github_delivery_id) do nothing
  returning * into v_row;

  if found then
    return jsonb_build_object('kind', 'new', 'status', v_row.processing_status);
  end if;

  select * into v_row
  from public.github_webhook_deliveries
  where github_delivery_id = p_delivery_id;

  if v_row.processing_status in ('failed', 'received') then
    update public.github_webhook_deliveries
    set processing_status = 'received',
        error_code = null,
        processed_at = null,
        action = coalesce(p_action, action),
        github_external_installation_id = coalesce(p_installation_id, github_external_installation_id),
        github_repository_id = coalesce(p_repository_id, github_repository_id)
    where github_delivery_id = p_delivery_id
      and processing_status in ('failed', 'received')
    returning * into v_row;
    if found then
      return jsonb_build_object('kind', 'retry', 'status', 'received');
    end if;
  end if;

  return jsonb_build_object('kind', 'duplicate', 'status', v_row.processing_status);
end;
$$;

create or replace function public.finish_github_webhook_delivery(
  p_delivery_id text,
  p_status text,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'invalid delivery status';
  end if;

  update public.github_webhook_deliveries
  set processing_status = p_status,
      error_code = p_error_code,
      processed_at = now()
  where github_delivery_id = p_delivery_id;
end;
$$;

create or replace function public.apply_github_webhook_installation(
  p_external_installation_id bigint,
  p_action text,
  p_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.github_installations%rowtype;
begin
  select * into v_installation
  from public.github_installations
  where github_external_installation_id = p_external_installation_id
    and deleted_at is null;

  if not found then
    return false;
  end if;

  if p_action = 'deleted' then
    update public.github_installations
    set deleted_at = p_at,
        suspended_at = coalesce(suspended_at, p_at),
        updated_at = p_at
    where id = v_installation.id;

    update public.repositories
    set connection_status = 'inaccessible',
        last_synced_at = p_at,
        updated_at = p_at
    where github_installation_id = v_installation.id;
    return true;
  end if;

  if p_action = 'suspend' then
    update public.github_installations
    set suspended_at = p_at,
        updated_at = p_at
    where id = v_installation.id;
    return true;
  end if;

  if p_action = 'unsuspend' then
    update public.github_installations
    set suspended_at = null,
        updated_at = p_at
    where id = v_installation.id
      and deleted_at is null;
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.apply_github_webhook_repository_access(
  p_external_installation_id bigint,
  p_github_repository_ids bigint[],
  p_accessible boolean,
  p_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_installation public.github_installations%rowtype;
  v_count integer;
begin
  select * into v_installation
  from public.github_installations
  where github_external_installation_id = p_external_installation_id;

  if not found then
    return 0;
  end if;

  if p_accessible then
    update public.repositories
    set connection_status = 'connected',
        last_synced_at = p_at,
        updated_at = p_at
    where github_installation_id = v_installation.id
      and github_repository_id = any (p_github_repository_ids);
  else
    update public.repositories
    set connection_status = 'inaccessible',
        last_synced_at = p_at,
        updated_at = p_at
    where github_installation_id = v_installation.id
      and github_repository_id = any (p_github_repository_ids);
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

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
set search_path = public
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
          when coalesce(p_is_disabled, is_disabled) then 'inaccessible'
          else 'connected'
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
    'github',
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
    case when coalesce(p_is_disabled, false) then 'inaccessible' else 'connected' end,
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
set search_path = public
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
    and connection_status = 'connected'
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
      'incremental',
      'queued',
      0,
      'pending',
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
