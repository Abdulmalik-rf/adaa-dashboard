-- Update schema.sql to add storage bucket
-- Supabase Database Schema for Agency CRMs

-- 0. Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create a safe schema trigger to handle updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 2. Clients Table
CREATE TABLE IF NOT EXISTS public.clients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    full_name TEXT NOT NULL,
    company_name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    email TEXT,
    city TEXT,
    business_type TEXT,
    status TEXT DEFAULT 'lead' CHECK (status IN ('lead', 'active', 'paused', 'completed')),
    start_date DATE,
    notes TEXT,
    website_url TEXT,
    google_maps_url TEXT,
    google_business_url TEXT,
    online_presence_notes TEXT
);

DROP TRIGGER IF EXISTS update_clients_updated_at ON public.clients;
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 3. Client Services
CREATE TABLE IF NOT EXISTS public.client_services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    service_name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Social Accounts
CREATE TABLE IF NOT EXISTS public.social_accounts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    username TEXT,
    url TEXT,
    notes TEXT,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'needs_attention')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS update_social_accounts_updated_at ON public.social_accounts;
CREATE TRIGGER update_social_accounts_updated_at BEFORE UPDATE ON public.social_accounts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 5. Contracts
CREATE TABLE IF NOT EXISTS public.contracts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    contract_type TEXT NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    renewal_date DATE,
    status TEXT DEFAULT 'unsigned' CHECK (status IN ('unsigned', 'active', 'expired', 'ending_soon', 'renewed')),
    value DECIMAL(12,2),
    notes TEXT,
    file_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at BEFORE UPDATE ON public.contracts FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 6. Reminders
CREATE TABLE IF NOT EXISTS public.reminders (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT NOT NULL,
    due_date DATE NOT NULL,
    due_time TIME,
    priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    is_recurring BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS update_reminders_updated_at ON public.reminders;
CREATE TRIGGER update_reminders_updated_at BEFORE UPDATE ON public.reminders FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 7. Client Files
CREATE TABLE IF NOT EXISTS public.client_files (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT,
    file_type TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Content Items
CREATE TABLE IF NOT EXISTS public.content_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    content_type TEXT NOT NULL,
    title TEXT NOT NULL,
    caption TEXT,
    media_url TEXT,
    publish_date DATE NOT NULL,
    publish_time TIME,
    status TEXT DEFAULT 'idea' CHECK (status IN ('idea', 'pending', 'approved', 'scheduled', 'published')),
    campaign_name TEXT,
    notes TEXT,
    assigned_person_id UUID,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS update_content_items_updated_at ON public.content_items;
CREATE TRIGGER update_content_items_updated_at BEFORE UPDATE ON public.content_items FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 9. Ad Campaigns
CREATE TABLE IF NOT EXISTS public.ad_campaigns (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    account_link TEXT,
    name TEXT NOT NULL,
    budget DECIMAL(12,2),
    objective TEXT,
    start_date DATE,
    end_date DATE,
    status TEXT DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'paused', 'completed')),
    notes TEXT,
    performance_summary TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
DROP TRIGGER IF EXISTS update_ad_campaigns_updated_at ON public.ad_campaigns;
CREATE TRIGGER update_ad_campaigns_updated_at BEFORE UPDATE ON public.ad_campaigns FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- 10. Communication Logs
CREATE TABLE IF NOT EXISTS public.communication_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    date TIMESTAMPTZ NOT NULL DEFAULT now(),
    type TEXT NOT NULL,
    summary TEXT,
    notes TEXT,
    person_id UUID,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 11. Notifications (for future WhatsApp integration & internal)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('internal', 'external_whatsapp')),
    message TEXT NOT NULL,
    related_client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE,
    related_entity_type TEXT,
    related_entity_id UUID,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    run_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 12. Storage Buckets (if Storage API exists in this Supabase setup)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('client_files', 'client_files', true)
ON CONFLICT (id) DO NOTHING;

-- Seed Data

INSERT INTO public.clients (id, full_name, company_name, phone, whatsapp, email, city, business_type, status, start_date) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Ahmed Youssef', 'TechNova Solutions', '+966500000001', '+966500000001', 'ahmed@technova.sa', 'Riyadh', 'Technology', 'active', '2023-01-15')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, full_name, company_name, phone, whatsapp, email, city, business_type, status, start_date) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Sarah Al-Saud', 'Elegance Fashion', '+966500000002', '+966500000002', 'sarah@elegance.sa', 'Jeddah', 'Retail', 'active', '2023-06-20')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.clients (id, full_name, company_name, phone, whatsapp, email, city, business_type, status, start_date) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'Mohammed Khalid', 'Khalid Construct', '+966500000003', '+966500000003', 'mkhalid@construct.sa', 'Dammam', 'Construction', 'lead', '2023-11-01')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.client_services (client_id, service_name) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'systems development'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'website development'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'social media management'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'content creation'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'SEO');

INSERT INTO public.contracts (client_id, title, contract_type, start_date, end_date, status, value) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Annual Retainer', 'Development', '2023-01-15', '2024-01-15', 'ending_soon', 150000.00),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Social Media Q3-Q4', 'Marketing', '2023-06-20', '2023-12-20', 'active', 45000.00);

INSERT INTO public.reminders (client_id, title, type, due_date, status, priority) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'Contract Renewal Follow-up', 'contract ending soon', '2023-12-15', 'pending', 'high'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Monthly Report Delivery', 'custom', '2023-11-30', 'pending', 'medium');

INSERT INTO public.content_items (client_id, platform, content_type, title, publish_date, publish_time, status) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Instagram', 'Reel', 'Winter Collection Teaser', '2023-11-25', '18:00:00', 'scheduled'),
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12', 'Snapchat', 'Story', 'Behind the Scenes', '2023-11-26', '14:00:00', 'idea');

INSERT INTO public.communication_logs (client_id, type, summary, notes) VALUES 
('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13', 'call', 'Initial Consultation', 'Client is interested in local SEO for Dammam branches.');
