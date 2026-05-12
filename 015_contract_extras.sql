-- 015_contract_extras.sql
-- Backs the createContract server action which already writes these
-- columns. They aren't in the original schema.sql, so on any fresh
-- Supabase project the insert was silently failing. Idempotent.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS currency      TEXT DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS payment_cycle TEXT DEFAULT 'monthly'
    CHECK (payment_cycle IS NULL OR payment_cycle IN
      ('monthly','quarterly','semi_annual','annual','one_time','milestone'));

-- Force PostgREST to reload its column cache.
NOTIFY pgrst, 'reload schema';
