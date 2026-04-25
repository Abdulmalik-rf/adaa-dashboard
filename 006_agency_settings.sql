-- Single-row config table backing the Settings page. Stored as a regular
-- table (not env vars) so the agent and dashboard can read/write it the
-- same way as any other entity.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.agency_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    agency_name TEXT,
    support_email TEXT,
    whatsapp_provider TEXT,
    whatsapp_api_token_encrypted TEXT,
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_agency_settings_updated_at ON public.agency_settings;
CREATE TRIGGER update_agency_settings_updated_at BEFORE UPDATE ON public.agency_settings
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Seed the default row so upserts always have something to update.
INSERT INTO public.agency_settings (id) VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- Force PostgREST to pick up the new table without a manual restart.
NOTIFY pgrst, 'reload schema';
