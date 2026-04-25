-- Adds three things to make the per-client Contracts tab actually useful:
--   1. tasks.contract_id  — link a task to a specific contract so the page
--                           can show "this contract is delivered through
--                           tasks A/B/C, here's who's on each".
--   2. contracts.scope    — longer, structured description of what the
--                           contract covers (the existing `notes` is one
--                           liner).
--   3. contract_payments  — payment schedule per contract: amount, due
--                           date, paid date, status, method, notes.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS contract_id UUID REFERENCES public.contracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_contract_id ON public.tasks(contract_id);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS scope TEXT;

CREATE TABLE IF NOT EXISTS public.contract_payments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    contract_id UUID REFERENCES public.contracts(id) ON DELETE CASCADE,
    amount NUMERIC(12,2) NOT NULL,
    due_date DATE NOT NULL,
    paid_date DATE,
    status TEXT DEFAULT 'pending'
      CHECK (status IN ('pending','paid','overdue','cancelled')),
    method TEXT,
    notes TEXT,
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_contract_payments_updated_at ON public.contract_payments;
CREATE TRIGGER update_contract_payments_updated_at BEFORE UPDATE ON public.contract_payments
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_contract_payments_contract_id
  ON public.contract_payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_payments_due_date
  ON public.contract_payments(due_date);
