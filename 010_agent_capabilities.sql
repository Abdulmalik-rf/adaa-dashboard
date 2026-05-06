-- =============================================================================
-- Agent power-tool RPCs — `agent_query` and `agent_migrate`
-- =============================================================================
-- Two RPC functions the WhatsApp/in-dashboard agent can call to run arbitrary
-- SQL. Locked down so only the service_role JWT can execute them — anon and
-- authenticated keys cannot. The dashboard's public-facing client uses the
-- anon key, so even a leaked NEXT_PUBLIC_SUPABASE_ANON_KEY can't trigger
-- these.
--
-- Idempotent — safe to re-run.

-- agent_query: run a SELECT and return rows as a JSON array.
-- Wraps the supplied SQL inside `SELECT to_jsonb(array_agg(row_to_json(t)))
-- FROM (<sql>) t` so any read-only query Just Works.
create or replace function public.agent_query(sql text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  execute format('SELECT to_jsonb(array_agg(row_to_json(t))) FROM (%s) t', sql) into result;
  return coalesce(result, '[]'::jsonb);
exception
  when others then
    return jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
end;
$$;

-- agent_migrate: run arbitrary DDL or DML (ALTER TABLE, CREATE INDEX,
-- INSERT, UPDATE, DELETE, etc.). Returns { ok: true } on success or
-- { error, sqlstate } on failure. The agent is instructed to require
-- explicit user confirmation before calling this for destructive ops.
create or replace function public.agent_migrate(sql text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  execute sql;
  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE);
end;
$$;

-- Lock down — only service_role can execute these. Revoke from the
-- world (anon, authenticated end-users) and grant only to service_role.
revoke execute on function public.agent_query(text) from public;
revoke execute on function public.agent_query(text) from anon;
revoke execute on function public.agent_query(text) from authenticated;
grant  execute on function public.agent_query(text) to   service_role;

revoke execute on function public.agent_migrate(text) from public;
revoke execute on function public.agent_migrate(text) from anon;
revoke execute on function public.agent_migrate(text) from authenticated;
grant  execute on function public.agent_migrate(text) to   service_role;

-- Optional: an audit trail for everything the agent does via these RPCs.
-- We don't write to it from the SQL functions (would slow them down) but
-- the agent's executor logs each call here so you have a paper trail.
create table if not exists public.agent_audit (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sender      text,                                -- WhatsApp sender or 'in-dashboard'
  tool        text not null,                       -- db_query, db_migrate, run_code, etc.
  payload     jsonb,                               -- arguments passed to the tool
  result      jsonb,                               -- success result or error
  error       text                                 -- non-null when the tool threw
);

create index if not exists agent_audit_created_at_idx on public.agent_audit (created_at desc);

-- Lock the audit table to service_role only (not visible to dashboard users).
alter table public.agent_audit enable row level security;
drop policy if exists "service_role_only" on public.agent_audit;
create policy "service_role_only" on public.agent_audit
  for all to service_role using (true) with check (true);

notify pgrst, 'reload schema';
