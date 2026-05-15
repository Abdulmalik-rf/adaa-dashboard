-- 020_qoyod_integration.sql
-- Schema scaffolding for the Qoyod (https://www.qoyod.com) push integration.
-- Idempotent — safe to re-run. Apply BEFORE turning on the credentials
-- in agency_settings.
--
-- Qoyod's invoice API requires:
--   - a Qoyod customer (contact) id for the buyer
--   - a Qoyod product id for each line item
--   - a Qoyod inventory_id (your branch/location)
--   - an account id for payment posting
--
-- We cache the customer + product ids locally so we don't recreate them
-- on every invoice. First push for a new client → creates the customer
-- in Qoyod, stores the id. First push referencing a particular line
-- description → creates the product in Qoyod, stores the id keyed by
-- description fingerprint. Subsequent pushes are no-op lookups.

ALTER TABLE public.agency_settings
  ADD COLUMN IF NOT EXISTS qoyod_api_key                  TEXT,
  ADD COLUMN IF NOT EXISTS qoyod_default_inventory_id     INTEGER,
  ADD COLUMN IF NOT EXISTS qoyod_default_revenue_account  INTEGER,
  ADD COLUMN IF NOT EXISTS qoyod_default_payment_account  INTEGER,
  ADD COLUMN IF NOT EXISTS qoyod_org_name                 TEXT;

-- Cache Qoyod's contact id on each client so we don't re-create the
-- customer on every invoice push. NULL means "not pushed yet → create
-- on first push".
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS qoyod_customer_id INTEGER;

-- Map invoice-line descriptions → Qoyod product ids. Fingerprint is a
-- normalized form of the description (lowercased, whitespace-collapsed,
-- accents stripped) so similar lines reuse the same Qoyod product.
CREATE TABLE IF NOT EXISTS public.qoyod_products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint     TEXT UNIQUE NOT NULL,
  description     TEXT NOT NULL,
  qoyod_product_id INTEGER NOT NULL,
  default_unit_price NUMERIC(12,2),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qoyod_products_fingerprint ON public.qoyod_products (fingerprint);

NOTIFY pgrst, 'reload schema';
