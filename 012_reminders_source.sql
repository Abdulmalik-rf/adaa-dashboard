-- =============================================================================
-- Add `source` to reminders so we can distinguish public-chat meeting
-- requests from internally-created reminders.
-- =============================================================================
-- The public chatbot at emergize-sa.com books visitor meeting requests as
-- reminders rows (status='pending'). The dashboard's /calendar is an
-- aggregator over existing entities — reminders is the closest semantic
-- match, so we land there instead of creating a new dedicated table.
--
-- `source` is nullable and defaults to NULL so existing rows are unaffected.
-- New public requests set source='public_chat'.
--
-- Idempotent — safe to re-run.

alter table public.reminders add column if not exists source text;

notify pgrst, 'reload schema';
