-- Admin signup verification codes.
--
-- When someone tries to create an admin account from the login page, we
-- generate a 6-digit code, email it to the agency owner's address
-- (abdulmalikalrifaee@outlook.com), and require them to enter the code
-- to actually finish creating the admin account.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS public.admin_verification_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT NOT NULL,
    email TEXT NOT NULL,                                  -- destination address
    requested_for_email TEXT,                             -- the email of the would-be admin (optional, for audit)
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes'),
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Lookup index — we filter on code+email for verification
CREATE INDEX IF NOT EXISTS idx_admin_verification_codes_code_email
    ON public.admin_verification_codes (code, email);

-- Lookup for cleanup of expired codes
CREATE INDEX IF NOT EXISTS idx_admin_verification_codes_expires_at
    ON public.admin_verification_codes (expires_at);

-- RLS: only service-role can read/write. Login flow uses service-role anyway.
ALTER TABLE public.admin_verification_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access" ON public.admin_verification_codes;
CREATE POLICY "Service role full access"
    ON public.admin_verification_codes
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
