-- 019_hr_tables.sql
-- HR module Phase 1. Layers two new tables onto the existing
-- team_members directory:
--   • leave_requests   — employee leave applications + approval workflow
--   • payroll_records  — monthly payroll runs, who got paid when
-- Also extends team_members with HR-relevant columns (KSA labour-law
-- specifics like iqama tracking, hire_date for end-of-service calcs,
-- department/employment_type for org-chart reporting).
--
-- Idempotent — safe to re-run.

-- =============================================================================
-- TEAM_MEMBERS EXTENSIONS
-- =============================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS national_id      TEXT,
  ADD COLUMN IF NOT EXISTS iqama_number     TEXT,
  ADD COLUMN IF NOT EXISTS iqama_expiry     DATE,
  ADD COLUMN IF NOT EXISTS nationality      TEXT,
  ADD COLUMN IF NOT EXISTS hire_date        DATE,
  ADD COLUMN IF NOT EXISTS department       TEXT,
  ADD COLUMN IF NOT EXISTS employment_type  TEXT
    CHECK (employment_type IS NULL OR employment_type IN
      ('full_time','part_time','contractor','intern')),
  ADD COLUMN IF NOT EXISTS bank_iban        TEXT,
  ADD COLUMN IF NOT EXISTS annual_leave_balance INTEGER DEFAULT 21;
  -- 21 days = the Saudi labour-law statutory minimum

-- =============================================================================
-- LEAVE REQUESTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.leave_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'annual'
    CHECK (type IN ('annual','sick','unpaid','personal','maternity','paternity','bereavement','hajj','other')),
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  days         INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','cancelled')),
  reason       TEXT,
  decided_by   UUID,            -- auth user id of admin who approved/rejected
  decided_at   TIMESTAMPTZ,
  decision_note TEXT,           -- optional note from approver (e.g. "approved, but only 5 days")
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT leave_date_order CHECK (end_date >= start_date),
  CONSTRAINT leave_days_positive CHECK (days >= 1)
);

DROP TRIGGER IF EXISTS update_leave_requests_updated_at ON public.leave_requests;
CREATE TRIGGER update_leave_requests_updated_at BEFORE UPDATE ON public.leave_requests
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee ON public.leave_requests(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status   ON public.leave_requests(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates    ON public.leave_requests(start_date, end_date);

-- =============================================================================
-- PAYROLL RECORDS
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_records (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  period_year   INTEGER NOT NULL,
  period_month  INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  gross_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
  deductions    NUMERIC(12,2) NOT NULL DEFAULT 0,
  bonus         NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount    NUMERIC(12,2) GENERATED ALWAYS AS (gross_amount + bonus - deductions) STORED,
  currency      TEXT NOT NULL DEFAULT 'SAR',
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','cancelled')),
  paid_date     DATE,
  method        TEXT,           -- e.g. "bank_transfer", "cash", "cheque"
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (employee_id, period_year, period_month)
);

DROP TRIGGER IF EXISTS update_payroll_records_updated_at ON public.payroll_records;
CREATE TRIGGER update_payroll_records_updated_at BEFORE UPDATE ON public.payroll_records
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_payroll_period   ON public.payroll_records(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_payroll_employee ON public.payroll_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_status   ON public.payroll_records(status) WHERE status = 'pending';

NOTIFY pgrst, 'reload schema';
