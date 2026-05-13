-- 016_files_bucket.sql
-- Creates the `agency-files` Supabase Storage bucket referenced by
-- src/app/files (Files & Assets). The page has been writing to this
-- bucket from the browser since day one, but the bucket itself was never
-- provisioned — every upload silently 404'd at the Storage layer (and the
-- UI never noticed because client-side validation failed first).
--
-- Public read so the table can render the file with a direct URL.
-- Authenticated insert/delete so the server action can mutate while
-- bypassed-RLS service-role calls still work.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agency-files',
  'agency-files',
  true,
  104857600, -- 100MB per file (room for full deliverable PDFs / decks)
  NULL       -- no MIME allowlist — agency stores arbitrary docs
)
ON CONFLICT (id) DO UPDATE SET
  public          = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "agency_files_authenticated_insert" ON storage.objects;
CREATE POLICY "agency_files_authenticated_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'agency-files');

DROP POLICY IF EXISTS "agency_files_public_read" ON storage.objects;
CREATE POLICY "agency_files_public_read"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'agency-files');

DROP POLICY IF EXISTS "agency_files_authenticated_delete" ON storage.objects;
CREATE POLICY "agency_files_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'agency-files');
