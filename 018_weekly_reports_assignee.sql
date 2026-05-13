-- 018_weekly_reports_assignee.sql
-- Adds the "responsible person" column on weekly_reports. The new-client
-- wizard pre-creates a series of weekly_reports rows when the admin
-- selects an assignee + cadence; the assignee then receives a
-- notification whenever a report is due. The Calendar page already
-- aggregates weekly_reports by period_end, so populating them on
-- client-create makes report due-dates appear on the calendar
-- automatically with no further wiring.

ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_weekly_reports_assignee
  ON public.weekly_reports (assignee_id)
  WHERE assignee_id IS NOT NULL;

-- Force PostgREST to reload its schema cache so REST queries see the
-- new column immediately.
NOTIFY pgrst, 'reload schema';
