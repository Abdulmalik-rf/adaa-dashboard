-- Adds quotation generation to the CRM. Two tables:
--   quotations       — header (client, dates, terms, totals)
--   quotation_items  — line items (name, price, qty or % of profit)
--
-- Company defaults (Adaa VAT/CR/address) are column defaults so the WhatsApp
-- agent can create a quotation with zero arguments and it still renders a
-- complete document.

-- Quotations header
CREATE TABLE IF NOT EXISTS public.quotations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_number TEXT NOT NULL UNIQUE,

    client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,

    -- Denormalised client info so the quote stays intact even if the client
    -- row changes later. Populated from the linked client if client_id is set.
    client_name_ar TEXT,
    client_name_en TEXT,
    client_company TEXT,
    client_vat TEXT,
    client_cr TEXT,

    -- Company (seller) info — editable per quote but with Adaa defaults.
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

    -- Two-line payment terms (matches the generator HTML).
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

-- Line items
CREATE TABLE IF NOT EXISTS public.quotation_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quotation_id UUID REFERENCES public.quotations(id) ON DELETE CASCADE,

    name TEXT NOT NULL,
    description TEXT,

    pricing_mode TEXT NOT NULL DEFAULT 'fixed'
      CHECK (pricing_mode IN ('fixed','percentage')),

    -- Used when pricing_mode = 'fixed'.
    qty NUMERIC DEFAULT 1,
    unit_price NUMERIC(12,2) DEFAULT 0,

    -- Used when pricing_mode = 'percentage' (e.g. "15% of profit").
    percentage NUMERIC(5,2),

    position INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id
  ON public.quotation_items(quotation_id);
