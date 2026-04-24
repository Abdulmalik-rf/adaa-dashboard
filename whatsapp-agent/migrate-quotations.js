// One-off runner for the quotations migration. Usage:
//   SUPABASE_DB_URL='postgresql://postgres:PASSWORD@db.ddiaetxjjsobwkrapxnt.supabase.co:5432/postgres' \
//   node migrate-quotations.js
//
// Idempotent — safe to run multiple times.

import pg from 'pg'

const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Missing SUPABASE_DB_URL env var.')
  process.exit(1)
}

const SQL = `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_number TEXT NOT NULL UNIQUE,
    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
    client_name_ar TEXT,
    client_name_en TEXT,
    client_company TEXT,
    client_vat TEXT,
    client_cr TEXT,
    company_name TEXT DEFAULT 'Adaa',
    company_tagline TEXT DEFAULT 'Advertisement & Digital Solutions',
    company_phone TEXT DEFAULT '+966 577 602 467',
    company_address TEXT DEFAULT 'Saudi Arabia — Khobar',
    company_email TEXT DEFAULT 'abdulmalikalrifaee@outlook.com',
    company_vat TEXT DEFAULT '301339262200003',
    company_cr TEXT DEFAULT '43089565469',
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE,
    vat_rate NUMERIC(5,2) DEFAULT 15.00,
    term1_pct TEXT DEFAULT '50%',
    term1_desc TEXT DEFAULT 'After signing the contract',
    term2_pct TEXT DEFAULT '50%',
    term2_desc TEXT DEFAULT 'After the service period is finished and delivered as agreed',
    notes TEXT,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','paid')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

DROP TRIGGER IF EXISTS update_quotations_updated_at ON public.quotations;
CREATE TRIGGER update_quotations_updated_at BEFORE UPDATE ON public.quotations
  FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    pricing_mode TEXT NOT NULL DEFAULT 'fixed' CHECK (pricing_mode IN ('fixed','percentage')),
    qty NUMERIC DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,
    percentage NUMERIC(5,2),
    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id
  ON public.quotation_items(quotation_id);
`

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })

try {
  await client.connect()
  console.log('connected')
  await client.query(SQL)
  console.log('migration applied — quotations + quotation_items are ready')
} catch (err) {
  console.error('migration failed:', err.message)
  process.exit(1)
} finally {
  await client.end()
}
