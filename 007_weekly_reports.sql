-- Weekly client reports — header + nested arrays stored as JSONB so the
-- agent can build a report incrementally through conversation without
-- requiring a separate child-row dance for every section.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.weekly_reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    report_number TEXT NOT NULL UNIQUE,    -- WR-2026-W17
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name_snapshot TEXT,             -- captured at creation in case client renames

    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    issue_date DATE DEFAULT CURRENT_DATE,

    -- Cover / parties (optional overrides; defaults pulled from client/agency)
    prepared_for_contact TEXT,             -- "Ahmed Al-Rashid (Marketing Lead)"
    prepared_for_meta TEXT,                -- "Tech / B2B SaaS"
    prepared_for_email TEXT,

    summary TEXT,
    notes TEXT,

    -- Sections — nested arrays of objects.
    -- kpis:      [{ label, value, delta_label, delta_direction:'up'|'down'|'flat' }]
    -- platforms: [{ platform, dot_color, followers, delta_followers, posts_count, reach, engagement_rate }]
    -- content:   [{ title, platform, content_type, campaign_label, publish_date, media_url, status }]
    -- campaigns: [{ name, platform, objective, spend, currency, result, status }]
    -- tasks_done:[{ title, owner, completed_date }]
    -- tasks_plan:[{ title, owner, due_date }]
    kpis JSONB DEFAULT '[]'::jsonb,
    platforms JSONB DEFAULT '[]'::jsonb,
    content_items JSONB DEFAULT '[]'::jsonb,
    campaigns JSONB DEFAULT '[]'::jsonb,
    tasks_done JSONB DEFAULT '[]'::jsonb,
    tasks_plan JSONB DEFAULT '[]'::jsonb,

    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','archived')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_weekly_reports_updated_at ON public.weekly_reports;
CREATE TRIGGER update_weekly_reports_updated_at BEFORE UPDATE ON public.weekly_reports
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_weekly_reports_client_id
  ON public.weekly_reports(client_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_period
  ON public.weekly_reports(period_start, period_end);


-- Storage bucket for images the agent uploads (content thumbs, screenshots,
-- report covers, etc.). Public read so the rendered HTML/PDF can pull them
-- without signed URLs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('report-images', 'report-images', true)
ON CONFLICT (id) DO NOTHING;

-- Public read so embedded <img src="..."> works in the rendered template.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'report_images_public_read'
  ) THEN
    CREATE POLICY "report_images_public_read" ON storage.objects
      FOR SELECT TO public
      USING (bucket_id = 'report-images');
  END IF;
END
$$;

-- Service role writes (the agent uploads through service_role; bypasses RLS
-- anyway, but explicit policy makes the intent obvious).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND policyname = 'report_images_service_write'
  ) THEN
    CREATE POLICY "report_images_service_write" ON storage.objects
      FOR ALL TO service_role
      USING (bucket_id = 'report-images')
      WITH CHECK (bucket_id = 'report-images');
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
