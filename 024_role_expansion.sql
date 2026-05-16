-- 024_role_expansion.sql
-- Expands team_members.role beyond the binary admin/manager/staff so the
-- WhatsApp agent can adapt its tool surface per position. Idempotent.
--
-- New roles:
--   admin   — agency owner. Everything unlocked.
--   hr      — HR specialist / HR manager. All HR tools (approve leaves,
--             run payroll, draft letters, promote candidates, approve loans,
--             onboarding, performance briefs, send salary slips).
--   finance — Accountant / Finance manager. Accounting tools (push invoices
--             to Qoyod, push bills, approve payroll, reconcile bank
--             statements, VAT return).
--   manager — Department head. Approves direct-reports' leaves, requests
--             HR letters on their behalf, sees their team's performance
--             + attendance.
--   staff   — Regular employee. Self-service only (my_* tools, request_*).

ALTER TABLE public.team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE public.team_members ADD CONSTRAINT team_members_role_check
  CHECK (role IN ('admin', 'hr', 'finance', 'manager', 'staff'));

NOTIFY pgrst, 'reload schema';
