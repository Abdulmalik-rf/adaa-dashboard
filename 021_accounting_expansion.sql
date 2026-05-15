-- 021_accounting_expansion.sql
-- Bills (AP side) + smart category learning + overdue/nag tracking +
-- bank statement reconciliation. Same idempotent pattern as 019/020.

-- =============================================================================
-- BILLS (accounts payable — mirrors accounting_invoices for the AR side)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.accounting_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Vendor snapshot at issue time. Denormalised same as invoices.
  vendor_name      TEXT,
  vendor_vat       TEXT,
  vendor_cr        TEXT,
  vendor_address   TEXT,
  qoyod_vendor_id  INTEGER,   -- cached so we don't re-POST /vendors

  receipt_url      TEXT,      -- the original receipt/invoice PDF or image
  bill_number      TEXT,      -- vendor's own invoice number (from the document)
  bill_reference   TEXT,      -- our internal reference (BILL-YYYY-NNN)

  issue_date       DATE NOT NULL DEFAULT current_date,
  due_date         DATE,
  payment_date     DATE,
  payment_method   TEXT,
  payment_reference TEXT,

  -- Expense category — meals / fuel / software / utilities / rent / etc.
  -- Filled by the smart-categorization step; admin can override.
  category         TEXT,
  -- Qoyod expense-account id for posting (filled from the categorization mapping
  -- when known, falls back to a default).
  qoyod_expense_account_id INTEGER,

  currency         TEXT DEFAULT 'SAR',
  line_items       JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal         NUMERIC(12,2),
  vat_rate         NUMERIC(5,2) DEFAULT 15.00,
  vat_amount       NUMERIC(12,2),
  total            NUMERIC(12,2),

  notes            TEXT,

  -- Workflow same as invoices, with the extra 'paid' terminal state
  -- (Qoyod's /bills supports a separate bill_payment).
  status           TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','pushed','paid','failed','void')),

  -- Simple bills (Qoyod's /simple_bills) are receipts without VAT split —
  -- restaurant meal receipts, parking, etc. Real bills with VAT detail
  -- go through /bills.
  is_simple        BOOLEAN DEFAULT false,

  -- External system handoff (mirrors invoices)
  external_system    TEXT,
  external_id        TEXT,
  external_url       TEXT,
  external_pushed_at TIMESTAMPTZ,
  push_error         TEXT,

  created_by       UUID,
  approved_by      UUID,
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_bills_bill_reference_unique
  ON public.accounting_bills (bill_reference)
  WHERE bill_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_bills_vendor   ON public.accounting_bills (vendor_name);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_status   ON public.accounting_bills (status);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_category ON public.accounting_bills (category);
CREATE INDEX IF NOT EXISTS idx_accounting_bills_issue    ON public.accounting_bills (issue_date DESC);

DROP TRIGGER IF EXISTS update_accounting_bills_updated_at ON public.accounting_bills;
CREATE TRIGGER update_accounting_bills_updated_at
  BEFORE UPDATE ON public.accounting_bills
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- =============================================================================
-- QOYOD VENDOR CACHE (mirrors qoyod_products)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.qoyod_vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint     TEXT UNIQUE NOT NULL,
  vendor_name     TEXT NOT NULL,
  qoyod_vendor_id INTEGER NOT NULL,
  default_account_id INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qoyod_vendors_fingerprint ON public.qoyod_vendors (fingerprint);

-- =============================================================================
-- SMART EXPENSE CATEGORY LEARNING
-- vendor_fingerprint → category mapping. The categorizer checks this
-- table first before falling back to AI inference. Hit counts so we can
-- surface "you usually categorize X as Y" in the UI.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.expense_category_mappings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_fingerprint       TEXT UNIQUE NOT NULL,
  vendor_name_sample       TEXT,
  category                 TEXT NOT NULL,
  qoyod_expense_account_id INTEGER,
  hit_count                INTEGER NOT NULL DEFAULT 1,
  last_used_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- OVERDUE NAG TRACKER — records that the nag-bot has already fired for a
-- given invoice + stage so we don't double-message.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.invoice_nag_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID NOT NULL REFERENCES public.accounting_invoices(id) ON DELETE CASCADE,
  stage         TEXT NOT NULL,  -- 'gentle_7d' / 'firm_14d' / 'escalation_30d'
  channel       TEXT,            -- 'whatsapp' / 'email' (when sent) — null when admin still reviewing
  status        TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','sent','skipped','admin_rejected')),
  draft_text    TEXT,
  sent_at       TIMESTAMPTZ,
  admin_user_id UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (invoice_id, stage)
);

CREATE INDEX IF NOT EXISTS idx_invoice_nag_log_invoice ON public.invoice_nag_log (invoice_id);

-- =============================================================================
-- BANK STATEMENT RECONCILIATION
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.bank_statement_uploads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_path       TEXT NOT NULL,
  bank_name       TEXT,
  account_iban    TEXT,
  account_label   TEXT,            -- "Al Rajhi Main", "SNB USD", etc.
  period_from     DATE,
  period_to       DATE,
  raw_text        TEXT,             -- the extracted PDF text (for debug + re-parse)
  status          TEXT DEFAULT 'parsed'
    CHECK (status IN ('parsed','reconciling','reconciled','failed')),
  parse_error     TEXT,
  total_transactions INTEGER DEFAULT 0,
  matched_count   INTEGER DEFAULT 0,
  uploaded_by     UUID,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.bank_transactions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_upload_id    UUID NOT NULL REFERENCES public.bank_statement_uploads(id) ON DELETE CASCADE,
  transaction_date       DATE,
  description            TEXT,
  amount                 NUMERIC(12,2),     -- positive = credit (money in), negative = debit (money out)
  balance_after          NUMERIC(12,2),
  reference              TEXT,
  -- A transaction can match at most one of these. Match confidence
  -- comes from the score the auto-matcher produces.
  matched_invoice_id     UUID REFERENCES public.accounting_invoices(id) ON DELETE SET NULL,
  matched_bill_id        UUID REFERENCES public.accounting_bills(id) ON DELETE SET NULL,
  match_confidence       TEXT,
    -- 'auto_high' (amount + ref both match), 'auto_low' (only amount),
    -- 'manual' (admin matched), 'unmatched'
  notes                  TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_tx_statement ON public.bank_transactions (statement_upload_id);
CREATE INDEX IF NOT EXISTS idx_bank_tx_date      ON public.bank_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched_invoice ON public.bank_transactions (matched_invoice_id) WHERE matched_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_tx_matched_bill    ON public.bank_transactions (matched_bill_id) WHERE matched_bill_id IS NOT NULL;

DROP TRIGGER IF EXISTS update_bank_statement_uploads_updated_at ON public.bank_statement_uploads;
CREATE TRIGGER update_bank_statement_uploads_updated_at
  BEFORE UPDATE ON public.bank_statement_uploads
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

NOTIFY pgrst, 'reload schema';
