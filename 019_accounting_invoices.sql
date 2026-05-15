-- 019_accounting_invoices.sql
-- Bookkeeping for the "client pays → receipt PDF → draft VAT invoice → admin
-- approves → push to Qoyod" workflow. The dashboard owns the draft + approval
-- stage; the external_* columns capture the Qoyod (or Daftra) push outcome
-- once the credentials are wired in.

CREATE TABLE IF NOT EXISTS public.accounting_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source links — at least one of these is usually set so the invoice
  -- can be tied back to its quote/contract chain.
  client_id     UUID REFERENCES public.clients(id)     ON DELETE SET NULL,
  quotation_id  UUID REFERENCES public.quotations(id)  ON DELETE SET NULL,
  contract_id   UUID REFERENCES public.contracts(id)   ON DELETE SET NULL,

  -- The bank-transfer PDF the admin forwarded to the agent. Kept so the
  -- admin can re-open the original receipt from the invoice card.
  receipt_url   TEXT,

  -- Our internal invoice number — INV-YYYY-NNN. Unique so the same
  -- physical receipt can't accidentally be invoiced twice.
  invoice_number TEXT UNIQUE,

  -- Issue date defaults to today; payment_date is when the bank cleared
  -- the transfer (extracted from the receipt).
  issue_date    DATE NOT NULL DEFAULT current_date,
  payment_date  DATE,
  payment_method TEXT,            -- bank_transfer / cash / cheque / card
  payment_reference TEXT,         -- transaction id from the receipt

  -- Customer snapshot at issue time. Kept denormalised so the invoice
  -- doesn't mutate if the client row gets edited later.
  customer_name      TEXT,
  customer_vat       TEXT,
  customer_cr        TEXT,
  customer_address   TEXT,

  currency      TEXT DEFAULT 'SAR',

  -- Line items as JSONB so the schema stays flexible: each entry is
  -- { description, qty, unit_price, vat_rate, vat_amount, line_total }.
  line_items    JSONB NOT NULL DEFAULT '[]'::jsonb,
  subtotal      NUMERIC(12,2),
  vat_rate      NUMERIC(5,2) DEFAULT 15.00,  -- KSA standard rate
  vat_amount    NUMERIC(12,2),
  total         NUMERIC(12,2),

  notes         TEXT,

  -- Workflow:
  --   draft     → just extracted from the receipt, admin still reviewing
  --   approved  → admin OK'd it; ready to push to the accounting system
  --   pushed    → successfully landed in Qoyod/Daftra
  --   failed    → push attempted but the external system rejected
  --   void      → admin cancelled the draft (kept for audit, hidden by default)
  status        TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','approved','pushed','failed','void')),

  -- External-system reference (filled in once we push to Qoyod).
  external_system    TEXT,        -- 'qoyod' / 'daftra'
  external_id        TEXT,        -- invoice ID returned by the external API
  external_url       TEXT,        -- deep link
  external_pushed_at TIMESTAMPTZ,
  push_error         TEXT,        -- last push failure message (cleared on success)

  -- Audit
  created_by    UUID,             -- auth user (admin who triggered the extract)
  approved_by   UUID,
  approved_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_accounting_invoices_client_id      ON public.accounting_invoices (client_id);
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_quotation_id   ON public.accounting_invoices (quotation_id);
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_contract_id    ON public.accounting_invoices (contract_id);
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_status         ON public.accounting_invoices (status);
CREATE INDEX IF NOT EXISTS idx_accounting_invoices_issue_date     ON public.accounting_invoices (issue_date DESC);

DROP TRIGGER IF EXISTS update_accounting_invoices_updated_at ON public.accounting_invoices;
CREATE TRIGGER update_accounting_invoices_updated_at
  BEFORE UPDATE ON public.accounting_invoices
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

NOTIFY pgrst, 'reload schema';
