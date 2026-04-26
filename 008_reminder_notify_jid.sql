-- Adds notify_jid to reminders so the scheduler can send each reminder
-- back to whichever WhatsApp user actually created it. NULL = fall back
-- to the agent's default notify JID (the first allowed user in env).
--
-- Idempotent — safe to re-run.

ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS notify_jid TEXT;

NOTIFY pgrst, 'reload schema';
