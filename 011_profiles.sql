-- =============================================================================
-- profiles — per-auth-user metadata (role, full_name, email, avatar)
-- =============================================================================
-- Backs the `getCurrentUser()` SSR helper at src/lib/supabase/server.ts:30.
-- Without this table the helper returns { ...user, profile: null } for every
-- signed-in user, which silently disables admin gating across the dashboard.
--
-- This file documents the schema that already exists in the live Supabase
-- project (created manually before migrations were tracked). It uses
-- `create table if not exists` so re-applying it is a no-op.
--
-- Idempotent — safe to re-run.

create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  role        text not null default 'user' check (role in ('admin', 'manager', 'staff', 'user')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Keep updated_at fresh on every UPDATE — same trigger pattern as
-- the rest of the schema (clients, contracts, etc.).
create or replace function public.tg_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at_trg on public.profiles;
create trigger profiles_updated_at_trg
  before update on public.profiles
  for each row execute procedure public.tg_profiles_updated_at();

-- RLS — every signed-in user can read + update THEIR OWN profile;
-- admins can read everyone's. Service-role bypasses RLS.
alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select to authenticated
  using (
    auth.uid() = id
    or exists (
      select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write" on public.profiles
  for all to authenticated
  using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  )
  with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

-- Auto-create a profile row when a new auth user is created via the dashboard
-- (signup flow). Service-role created users (createTeamMember etc.) explicitly
-- upsert the profile in the action, so this trigger handles signup-only paths.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_app_meta_data->>'role', 'user')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_auth_user();

notify pgrst, 'reload schema';
