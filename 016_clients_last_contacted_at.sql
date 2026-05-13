-- Track the last time we reached out to a client. NULL means "never
-- contacted yet" — typical for to_contact rows freshly captured from
-- business cards. The clients UI shows a "Not contacted" pill until
-- this column gets stamped.
--
-- The WhatsApp agent stamps this automatically after a successful
-- send_whatsapp_message / send_email call that includes a client_id,
-- and also bumps status='to_contact' → 'lead' in the same step.

alter table public.clients
  add column if not exists last_contacted_at timestamptz;

-- Cheap lookup for the "not yet contacted" filter on the clients page.
create index if not exists clients_last_contacted_at_null_idx
  on public.clients (last_contacted_at)
  where last_contacted_at is null;
