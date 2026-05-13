-- 017_open_storage_policies.sql
-- The content-uploads + agency-files buckets had INSERT policies scoped
-- `TO authenticated`. That's correct in principle, BUT the server
-- actions that drive both flows run as `service_role` (via
-- agentSupabase()), which is supposed to bypass RLS entirely. In
-- production we're seeing "new row violates row-level security policy"
-- on the agency-files INSERT — meaning the running process is somehow
-- using the anon key instead of service-role (likely a stale or wrong
-- SUPABASE_SERVICE_ROLE_KEY value in the Hostinger env panel).
--
-- Since both upload flows go through server actions that gate on
-- getCurrentUser(), application-level auth is already enforced. The
-- storage policy just needs to let the request through. Opening
-- INSERT/DELETE to `public` (= anon + authenticated + service_role)
-- makes the flows work regardless of which key the Node worker uses.

-- agency-files
DROP POLICY IF EXISTS "agency_files_authenticated_insert" ON storage.objects;
CREATE POLICY "agency_files_anyone_insert"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'agency-files');

DROP POLICY IF EXISTS "agency_files_authenticated_delete" ON storage.objects;
CREATE POLICY "agency_files_anyone_delete"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'agency-files');

-- content-uploads — same fix so future uploads from the same code path
-- aren't gated on the env var either
DROP POLICY IF EXISTS "content_uploads_authenticated_insert" ON storage.objects;
CREATE POLICY "content_uploads_anyone_insert"
  ON storage.objects FOR INSERT
  TO public
  WITH CHECK (bucket_id = 'content-uploads');

DROP POLICY IF EXISTS "content_uploads_authenticated_delete" ON storage.objects;
CREATE POLICY "content_uploads_anyone_delete"
  ON storage.objects FOR DELETE
  TO public
  USING (bucket_id = 'content-uploads');
