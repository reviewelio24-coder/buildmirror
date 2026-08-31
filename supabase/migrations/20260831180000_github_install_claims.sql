-- Pending GitHub installation claims. Ownership is proven later with a
-- user-to-server token. Do not store user access tokens or refresh tokens.
-- Apply after 20260831160000_github_install_setup.sql.

create table public.github_install_claims (
  nonce uuid primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  github_external_installation_id bigint not null,
  return_to text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint github_install_claims_return_to_internal_check
    check (return_to like '/%' and return_to not like '//%')
);

create index github_install_claims_user_created_idx
  on public.github_install_claims (user_id, created_at desc);

create index github_install_claims_user_external_idx
  on public.github_install_claims (user_id, github_external_installation_id);

comment on table public.github_install_claims is
  'One-time pending GitHub installation claims. Tokens are not stored.';
comment on column public.github_install_claims.github_external_installation_id is
  'GitHub numeric installation_id awaiting user-to-server ownership proof';

alter table public.github_install_claims enable row level security;

create policy github_install_claims_select_own on public.github_install_claims
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy github_install_claims_insert_own on public.github_install_claims
  for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy github_install_claims_update_own on public.github_install_claims
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and consumed_at is not null
  );
create policy github_install_claims_delete_own on public.github_install_claims
  for delete to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.prevent_github_install_claim_rebind()
returns trigger
language plpgsql
set search_path = public
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

drop trigger if exists github_install_claims_prevent_rebind
  on public.github_install_claims;
create trigger github_install_claims_prevent_rebind
before update on public.github_install_claims
for each row execute function public.prevent_github_install_claim_rebind();

create or replace function public.assert_github_installation_claimed()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.github_install_claims c
    where c.user_id = new.user_id
      and c.github_external_installation_id = new.github_external_installation_id
      and c.consumed_at is not null
      and c.consumed_at > now() - interval '15 minutes'
  ) then
    raise exception 'github installation requires a consumed ownership claim';
  end if;
  return new;
end;
$$;

drop trigger if exists github_installations_require_claim
  on public.github_installations;
create trigger github_installations_require_claim
before insert or update of github_external_installation_id, user_id
on public.github_installations
for each row execute function public.assert_github_installation_claimed();

revoke all on function public.prevent_github_install_claim_rebind() from public, anon;
revoke all on function public.assert_github_installation_claimed() from public, anon;
