-- Clarify GitHub installation identifiers and add Setup URL state nonces.
-- Apply after 20260831140000_github_installations.sql.
--
-- github_installations.id
--   BuildMirror internal UUID
-- github_installations.github_external_installation_id
--   GitHub numeric installation_id
-- repositories.github_installation_id
--   FK to github_installations.id (internal UUID), not the GitHub number
--
-- Do not store App private keys or installation access tokens.

alter table public.github_installations
  rename column github_installation_id to github_external_installation_id;

alter table public.github_installations
  add column events jsonb not null default '[]'::jsonb,
  add column last_synced_at timestamptz;

comment on column public.github_installations.id is
  'BuildMirror internal UUID';
comment on column public.github_installations.github_external_installation_id is
  'GitHub numeric installation_id';
comment on column public.repositories.github_installation_id is
  'FK to github_installations.id (internal UUID), not the GitHub number';

create table public.github_install_states (
  nonce uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index github_install_states_user_created_idx
  on public.github_install_states (user_id, created_at desc);

alter table public.github_install_states enable row level security;

create policy github_install_states_select_own on public.github_install_states
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy github_install_states_insert_own on public.github_install_states
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy github_install_states_update_own on public.github_install_states
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy github_install_states_delete_own on public.github_install_states
  for delete to authenticated
  using (user_id = (select auth.uid()));
