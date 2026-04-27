-- Weekly report redesign — service-centric, editable from the dashboard.
--
-- Old per-section columns (kpis, platforms, content_items, campaigns,
-- tasks_done, tasks_plan) are kept as-is for backward compat with the
-- handful of sample reports already created. The new viewer prefers the
-- `services` array; old reports keep rendering through their legacy
-- columns until they're migrated by hand.
--
-- Idempotent — safe to re-run.

ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS customer_name TEXT,
  ADD COLUMN IF NOT EXISTS customer_company TEXT,
  ADD COLUMN IF NOT EXISTS cover_image_url TEXT,
  ADD COLUMN IF NOT EXISTS services JSONB DEFAULT '[]'::jsonb;

-- Backfill: when an old report has only client_name_snapshot, copy it into
-- customer_name so the new viewer has something to display.
UPDATE public.weekly_reports
   SET customer_name = client_name_snapshot
 WHERE customer_name IS NULL
   AND client_name_snapshot IS NOT NULL;

NOTIFY pgrst, 'reload schema';
