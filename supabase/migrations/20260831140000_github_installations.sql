-- GitHub App installation metadata. Do not store private keys or
-- installation access tokens in this table or any other table.
-- Apply after 20260831120000_referential_integrity.sql.

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  github_installation_id bigint not null,
  account_login text not null,
  account_type text not null,
  account_id bigint not null,
  repository_selection text not null,
  permissions jsonb not null default '{}'::jsonb,
  installed_at timestamptz not null,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint github_installations_account_type_check
    check (account_type in ('User', 'Organization')),
  constraint github_installations_selection_check
    check (repository_selection in ('all', 'selected')),
  constraint github_installations_github_id_key
    unique (github_installation_id),
  constraint github_installations_user_id_id_key
    unique (user_id, id)
);

create index github_installations_user_id_idx
  on public.github_installations (user_id, created_at desc);

drop trigger if exists github_installations_set_updated_at on public.github_installations;
create trigger github_installations_set_updated_at
before update on public.github_installations
for each row execute function public.set_updated_at();

alter table public.repositories
  add column github_installation_id uuid,
  add column github_repository_id bigint,
  add column html_url text,
  add column is_private boolean;

alter table public.repositories
  add constraint repositories_github_installation_user_fkey
  foreign key (user_id, github_installation_id)
  references public.github_installations (user_id, id)
  on delete set null;

alter table public.repositories
  add constraint repositories_github_provider_check
  check (
    github_installation_id is null
    or provider = 'github'
  );

alter table public.repositories
  add constraint repositories_github_repository_id_check
  check (
    github_repository_id is null
    or provider = 'github'
  );

create unique index repositories_user_github_repository_id_key
  on public.repositories (user_id, github_repository_id)
  where github_repository_id is not null;

create or replace function public.owns_github_installation(p_installation_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.github_installations
    where id = p_installation_id
      and user_id = (select auth.uid())
  );
$$;

alter table public.github_installations enable row level security;

create policy github_installations_select_own on public.github_installations
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy github_installations_insert_own on public.github_installations
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy github_installations_update_own on public.github_installations
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy github_installations_delete_own on public.github_installations
  for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists repositories_select_own on public.repositories;
drop policy if exists repositories_insert_own on public.repositories;
drop policy if exists repositories_update_own on public.repositories;
drop policy if exists repositories_delete_own on public.repositories;
create policy repositories_select_own on public.repositories
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy repositories_insert_own on public.repositories
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (
      github_installation_id is null
      or public.owns_github_installation(github_installation_id)
    )
  );
create policy repositories_update_own on public.repositories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (
      github_installation_id is null
      or public.owns_github_installation(github_installation_id)
    )
  );
create policy repositories_delete_own on public.repositories
  for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on function public.owns_github_installation(uuid) from public, anon;
grant execute on function public.owns_github_installation(uuid) to authenticated;
