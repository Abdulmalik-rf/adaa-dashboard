-- 023_hr_documents_expansion.sql
-- Phase 3 of HR — full document/template catalog + loan workflow + sick-leave
-- with doctor-note attachment. Idempotent.

-- =============================================================================
-- hr_letters: expand letter_type to cover every common HR document
-- =============================================================================
-- We drop the old CHECK constraint and re-create it with the full catalog.

ALTER TABLE public.hr_letters DROP CONSTRAINT IF EXISTS hr_letters_letter_type_check;
ALTER TABLE public.hr_letters ADD CONSTRAINT hr_letters_letter_type_check CHECK (letter_type IN (
  -- Hiring / onboarding
  'job_offer','employment_contract','employment_letter','nda','probation_completion','job_description',
  -- Compensation / career
  'salary_certificate','salary_certificate_for_bank','raise_letter','promotion_letter','bonus_letter','compensation_review',
  -- Time off (formal letters — separate from the leave_requests row)
  'vacation_request_letter','sick_leave_notice','maternity_leave_letter','paternity_leave_letter','hajj_leave_letter','bereavement_leave_letter','unpaid_leave_letter','return_to_work_letter','leave_approval_letter','leave_rejection_letter',
  -- Discipline
  'verbal_warning','written_warning','final_warning','suspension_letter','disciplinary_notice','termination',
  -- External-facing
  'noc','experience_letter','bank_loan_support_letter','visa_support_letter','dependent_visa_support','embassy_letter','property_rental_support','recommendation_letter',
  -- KSA-specific
  'hrdf_letter','gosi_subscription_letter','saudization_letter','mudawana_amendment',
  -- Financial
  'loan_request_letter','salary_advance_letter','salary_advance_repayment_schedule','expense_reimbursement_letter',
  -- Lifecycle
  'resignation_letter','resignation_acceptance','transfer_letter','relocation_letter','final_settlement_letter','exit_clearance_letter','retirement_letter',
  -- Catch-all
  'custom'
));

-- Add a metadata column for type-specific fields the template renderer needs
-- (e.g. loan amount, salary cert audience, transfer dest dept, etc.)
ALTER TABLE public.hr_letters
  ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb;

-- =============================================================================
-- hr_loan_requests — salary advance / loan workflow
-- Lifecycle:
--   draft → submitted (employee finished it via WA / dashboard)
--          → approved (admin approved, repayment schedule auto-written to payroll)
--          → rejected (admin declined)
--          → repaying  (first deduction taken in payroll_line_items)
--          → repaid    (all deductions taken, balance = 0)
--          → cancelled
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_loan_requests (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id        UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  amount             NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  currency           TEXT NOT NULL DEFAULT 'SAR',
  reason             TEXT,
  term_months        INTEGER NOT NULL CHECK (term_months BETWEEN 1 AND 60),
  monthly_deduction  NUMERIC(12,2) NOT NULL CHECK (monthly_deduction > 0),
  first_deduction_month INTEGER CHECK (first_deduction_month BETWEEN 1 AND 12),
  first_deduction_year  INTEGER,
  status             TEXT NOT NULL DEFAULT 'submitted'
    CHECK (status IN ('draft','submitted','approved','rejected','repaying','repaid','cancelled')),
  approved_by        UUID,
  approved_at        TIMESTAMPTZ,
  decision_note      TEXT,
  -- Link to the hr_letters row we auto-generate as the formal loan letter
  letter_id          UUID REFERENCES public.hr_letters(id) ON DELETE SET NULL,
  amount_repaid      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_hr_loan_requests_updated_at ON public.hr_loan_requests;
CREATE TRIGGER update_hr_loan_requests_updated_at BEFORE UPDATE ON public.hr_loan_requests
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_hr_loan_requests_employee ON public.hr_loan_requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_loan_requests_status   ON public.hr_loan_requests (status);

-- =============================================================================
-- leave_requests: doctor-note attachment for sick leave
-- =============================================================================

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS attachment_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT;

-- =============================================================================
-- team_members: separate sick/hajj balances (KSA labour-law-specific)
-- KSA: 30 days/year sick leave (first 30 paid 100%, next 60 at 75%, then 30 at 0%).
-- Hajj: 10-15 paid days once per employment.
-- =============================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS sick_leave_balance INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS hajj_leave_used BOOLEAN DEFAULT false;

NOTIFY pgrst, 'reload schema';
