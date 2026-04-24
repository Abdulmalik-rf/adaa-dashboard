-- Add 'to_contact' status for leads collected but not yet outreached
-- (used by the WhatsApp agent when it extracts business card info).
--
-- Idempotent: drops the existing constraint regardless of name, then re-adds
-- with the expanded value set. Also tolerates any previously-seen value
-- ('completed' from schema.sql, 'inactive' seen in UI code) so this is safe
-- to run on any existing database.

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_status_check
  CHECK (status IN ('to_contact', 'lead', 'active', 'paused', 'completed', 'inactive'));
