-- Structured plan/process on each contract.
--   - scope: a paragraph the agency uses to describe "what this contract
--            covers" in plain language.
--   - deliverables: an ordered list of concrete items that make up the
--            engagement, stored as JSONB so the agent (and the contract
--            form) can build them up incrementally without a child table.
--
-- Each deliverable looks like:
--   { id: string, title: string, detail?: string, due_date?: 'YYYY-MM-DD',
--     status?: 'pending'|'in_progress'|'done' }
--
-- The workspace contract card renders the list as a checklist; ticking
-- a row sets status='done'. The agent can edit this list via update_contract.
--
-- Idempotent.

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS scope TEXT,
  ADD COLUMN IF NOT EXISTS deliverables JSONB DEFAULT '[]'::jsonb;

-- Force PostgREST to reload its column cache so the new columns are
-- queryable from the JS client immediately.
NOTIFY pgrst, 'reload schema';
