-- 022_hr_automation.sql
-- Phase 2 of HR — schema scaffolding for the full 13-feature AI automation
-- suite. Idempotent. Safe to re-run.
--
-- Tables / columns added in this migration:
--   team_members extensions    — passport_expiry, visa_expiry, birthday,
--                                gosi_number, gosi_subject (saudi/expat),
--                                base_salary, salary_currency (if missing),
--                                housing_allowance, transport_allowance,
--                                other_allowances, manager_id
--   hr_documents               — F12 doc library (passport / iqama / contract scans)
--   hr_expiry_watchlog         — F1 dedupe so we don't nag at every tick
--   attendance_logs            — F9 in/out/WFH check-ins
--   onboarding_checklists +    — F7 generated checklist + items
--     onboarding_checklist_items
--   payroll_line_items         — F4 breakdown rows (gosi, unpaid leave, eos)
--   eosb_snapshots             — F5 running EOSB accrual snapshot per employee/month
--   candidates                 — F10 CV intake landing table
--   hr_letters                 — F11 AI-drafted warning/termination letters
--   anniversary_nudge_log      — F13 dedupe for birthday / work-anniversary pings

-- =============================================================================
-- TEAM_MEMBERS EXTENSIONS
-- =============================================================================

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS passport_expiry      DATE,
  ADD COLUMN IF NOT EXISTS visa_expiry          DATE,
  ADD COLUMN IF NOT EXISTS birthday             DATE,
  ADD COLUMN IF NOT EXISTS gosi_number          TEXT,
  ADD COLUMN IF NOT EXISTS gosi_subject         TEXT
    CHECK (gosi_subject IS NULL OR gosi_subject IN ('saudi','expat','exempt')),
  ADD COLUMN IF NOT EXISTS base_salary          NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS salary_currency      TEXT DEFAULT 'SAR',
  ADD COLUMN IF NOT EXISTS housing_allowance    NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS transport_allowance  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_allowances     NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manager_id           UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  -- Profile / personal info bag for the bilingual salary slip + letters
  ADD COLUMN IF NOT EXISTS full_name_ar         TEXT,
  ADD COLUMN IF NOT EXISTS job_title_ar         TEXT;

-- Backfill base_salary from the pre-existing salary column (if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='team_members' AND column_name='salary') THEN
    UPDATE public.team_members SET base_salary = salary
      WHERE base_salary IS NULL AND salary IS NOT NULL;
  END IF;
END $$;

-- =============================================================================
-- F12: HR DOCUMENT LIBRARY (passport scans, iqama copies, employment contracts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  doc_type      TEXT NOT NULL
    CHECK (doc_type IN (
      'passport','iqama','visa','national_id','employment_contract',
      'gosi_certificate','medical_insurance','driving_license','certificate','other'
    )),
  file_path     TEXT NOT NULL,                 -- supabase storage path
  file_url      TEXT,                          -- public URL (or signed)
  doc_number    TEXT,                          -- iqama/passport number
  issue_date    DATE,
  expiry_date   DATE,
  notes         TEXT,
  ocr_text      TEXT,                          -- raw text extracted from the PDF
  uploaded_by   UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_hr_documents_updated_at ON public.hr_documents;
CREATE TRIGGER update_hr_documents_updated_at BEFORE UPDATE ON public.hr_documents
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_hr_documents_employee ON public.hr_documents (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_expiry   ON public.hr_documents (expiry_date)
  WHERE expiry_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hr_documents_type     ON public.hr_documents (doc_type);

-- =============================================================================
-- F1: EXPIRY WATCHDOG DEDUPE LOG
-- One row per (employee_id, kind, stage). Stages: '90d', '60d', '30d', '14d',
-- '7d', '1d'. kind: 'iqama' | 'passport' | 'visa' | 'document:<doc_type>'.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_expiry_watchlog (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID REFERENCES public.team_members(id) ON DELETE CASCADE,
  document_id  UUID REFERENCES public.hr_documents(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,
  stage        TEXT NOT NULL,
  expiry_date  DATE NOT NULL,
  channel      TEXT,
  status       TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','snoozed','admin_dismissed')),
  notified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, kind, stage, expiry_date)
);

CREATE INDEX IF NOT EXISTS idx_hr_expiry_watchlog_emp ON public.hr_expiry_watchlog (employee_id);

-- =============================================================================
-- F9: ATTENDANCE LOGS — in / out / WFH / late
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.attendance_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  log_date     DATE NOT NULL DEFAULT current_date,
  check_in_at  TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status       TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present','wfh','late','absent','on_leave','holiday')),
  late_minutes INTEGER DEFAULT 0,
  source       TEXT DEFAULT 'whatsapp',  -- 'whatsapp' / 'dashboard' / 'system'
  raw_message  TEXT,                     -- the inbound DM that produced the log
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_attendance_logs_updated_at ON public.attendance_logs;
CREATE TRIGGER update_attendance_logs_updated_at BEFORE UPDATE ON public.attendance_logs
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_logs_emp_date
  ON public.attendance_logs (employee_id, log_date);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date
  ON public.attendance_logs (log_date DESC);

-- =============================================================================
-- F7: ONBOARDING CHECKLIST
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.onboarding_checklists (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  template     TEXT NOT NULL DEFAULT 'saudi_full_time'
    CHECK (template IN ('saudi_full_time','expat_full_time','part_time','intern','contractor')),
  status       TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress','completed','cancelled')),
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_by   UUID,
  notes        TEXT,
  UNIQUE (employee_id)
);

CREATE TABLE IF NOT EXISTS public.onboarding_checklist_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES public.onboarding_checklists(id) ON DELETE CASCADE,
  position     INTEGER NOT NULL DEFAULT 0,
  title        TEXT NOT NULL,
  title_ar     TEXT,
  description  TEXT,
  category     TEXT,             -- 'paperwork' / 'access' / 'orientation' / 'compliance'
  owner_role   TEXT,             -- 'admin' / 'employee' / 'finance' / 'manager'
  due_offset_days INTEGER,       -- N days after hire_date
  done         BOOLEAN NOT NULL DEFAULT false,
  done_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_onb_items_checklist ON public.onboarding_checklist_items (checklist_id);
CREATE INDEX IF NOT EXISTS idx_onb_items_done      ON public.onboarding_checklist_items (done);

-- =============================================================================
-- F4: PAYROLL LINE-ITEM BREAKDOWN
-- Each payroll_record can have N lines explaining the gross→net path:
--   "Base salary"   → +6000
--   "Housing"       → +1000
--   "GOSI (9%)"     → -540
--   "Unpaid leave"  → -300
--   "EOSB accrual"  → reserved (informational)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.payroll_line_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payroll_id      UUID NOT NULL REFERENCES public.payroll_records(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL DEFAULT 0,
  kind            TEXT NOT NULL
    CHECK (kind IN (
      'base','housing','transport','allowance','bonus',
      'gosi_employee','gosi_employer','unpaid_leave','tax','advance',
      'penalty','eosb_accrual','other'
    )),
  label           TEXT NOT NULL,
  label_ar        TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  is_deduction    BOOLEAN NOT NULL DEFAULT false,
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payroll_line_payroll ON public.payroll_line_items (payroll_id);

-- Also: a flag on payroll_records to know we generated a salary slip PDF for it
ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS slip_pdf_url  TEXT,
  ADD COLUMN IF NOT EXISTS slip_sent_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS slip_channel  TEXT;  -- 'whatsapp' / 'email' / 'both'

-- =============================================================================
-- F5: EOSB SNAPSHOTS — current accrued end-of-service balance, refreshed
-- monthly. KSA labour-law accrual:
--   • Years 0..5   → 0.5 month salary per year served
--   • Years 5+     → 1.0 month salary per year served (from year 6 onward)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.eosb_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  as_of_date      DATE NOT NULL,
  years_served    NUMERIC(6,3) NOT NULL,
  monthly_salary  NUMERIC(12,2) NOT NULL,
  accrued_amount  NUMERIC(12,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, as_of_date)
);

CREATE INDEX IF NOT EXISTS idx_eosb_emp_date ON public.eosb_snapshots (employee_id, as_of_date DESC);

-- =============================================================================
-- F10: CANDIDATES — CV intake table, lives separate from team_members
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.candidates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT NOT NULL,
  email           TEXT,
  phone           TEXT,
  whatsapp        TEXT,
  nationality     TEXT,
  current_city    TEXT,
  current_title   TEXT,
  years_experience NUMERIC(4,1),
  education       TEXT,
  skills          TEXT[],
  languages       TEXT[],
  asking_salary   NUMERIC(12,2),
  salary_currency TEXT DEFAULT 'SAR',
  cv_url          TEXT,                 -- public URL of the CV PDF
  cv_text         TEXT,                 -- extracted text for search
  source          TEXT DEFAULT 'whatsapp',
  status          TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new','reviewing','interviewing','offered','hired','rejected','archived')),
  rating          INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
  notes           TEXT,
  promoted_to_team_member_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_candidates_updated_at ON public.candidates;
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON public.candidates
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_candidates_status ON public.candidates (status);
CREATE INDEX IF NOT EXISTS idx_candidates_created ON public.candidates (created_at DESC);

-- =============================================================================
-- F11: HR LETTERS — warning, PIP, termination, salary certificate, etc.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.hr_letters (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id     UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  letter_type     TEXT NOT NULL
    CHECK (letter_type IN (
      'verbal_warning','written_warning','final_warning','termination',
      'salary_certificate','employment_letter','noc','experience_letter','custom'
    )),
  subject         TEXT NOT NULL,
  body_en         TEXT,
  body_ar         TEXT,
  reference_clauses TEXT[],          -- KSA labour-law article refs cited
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','signed','superseded','void')),
  delivered_at    TIMESTAMPTZ,
  delivered_channel TEXT,            -- 'email' / 'whatsapp' / 'in_person'
  pdf_url         TEXT,
  created_by      UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_hr_letters_updated_at ON public.hr_letters;
CREATE TRIGGER update_hr_letters_updated_at BEFORE UPDATE ON public.hr_letters
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_hr_letters_employee ON public.hr_letters (employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_letters_type     ON public.hr_letters (letter_type);

-- =============================================================================
-- F13: ANNIVERSARY / BIRTHDAY NUDGE DEDUPE
-- One row per (employee_id, kind, year). kind: 'birthday' | 'work_anniversary'
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.anniversary_nudge_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('birthday','work_anniversary')),
  year_int     INTEGER NOT NULL,
  notified_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, kind, year_int)
);

-- =============================================================================
-- Storage bucket for HR documents (NB: bucket creation must happen via the
-- Supabase dashboard or storage API — this DDL only references the bucket).
-- We reuse 'content-uploads' for now; a future migration can split it out.
-- =============================================================================

NOTIFY pgrst, 'reload schema';
