-- 014_content_uploads.sql
-- Adds the "user uploads a post for a client → admin approves/denies"
-- workflow. Builds on the existing `content_items` row by adding
-- submission metadata + review notes. Status uses the existing
-- schedule_status enum: 'pending' = awaiting review, 'approved' = green-lit,
-- 'idea' = sent back to draft.

ALTER TABLE public.content_items
  ADD COLUMN IF NOT EXISTS submitted_by  UUID,
  ADD COLUMN IF NOT EXISTS submitted_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes  TEXT,
  ADD COLUMN IF NOT EXISTS description   TEXT,
  ADD COLUMN IF NOT EXISTS reviewed_by   UUID,
  ADD COLUMN IF NOT EXISTS reviewed_at   TIMESTAMPTZ;

-- Storage bucket for uploaded media. Public read so the kanban can render
-- thumbnails without signed URLs; writes are gated by RLS below.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-uploads',
  'content-uploads',
  true,
  52428800, -- 50MB per file
  ARRAY['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm']
)
ON CONFLICT (id) DO UPDATE SET
  public             = EXCLUDED.public,
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies. We accept uploads from any authenticated user (the
-- server action also runs with service-role, so this is defense-in-depth).
DROP POLICY IF EXISTS "content_uploads_authenticated_insert" ON storage.objects;
CREATE POLICY "content_uploads_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'content-uploads');

DROP POLICY IF EXISTS "content_uploads_public_read" ON storage.objects;
CREATE POLICY "content_uploads_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'content-uploads');

-- Lets admins remove rejected media. Keeping this loose since admin
-- delete already runs through the service-role server action.
DROP POLICY IF EXISTS "content_uploads_authenticated_delete" ON storage.objects;
CREATE POLICY "content_uploads_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'content-uploads');

-- Helpful index for the "pending review" admin query.
CREATE INDEX IF NOT EXISTS idx_content_items_pending_review
  ON public.content_items (submitted_at DESC)
  WHERE schedule_status = 'pending' AND submitted_at IS NOT NULL;
