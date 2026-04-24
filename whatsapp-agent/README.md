# Adaa WhatsApp Agent

Lets you add things to the Adaa CRM by sending WhatsApp messages to your own number.

```
You -> WhatsApp -> this agent -> GPT (tool use) -> Supabase (same DB as the dashboard)
```

## How it works

- `src/index.js` — connects to WhatsApp via `whatsapp-web.js` (QR code on first run, session persisted after).
- Incoming messages are filtered: only messages from `ALLOWED_PHONE` reach the agent.
- `src/agent.js` runs an OpenAI tool-use loop authenticated with a **ChatGPT OAuth JWT** (not a platform API key). The JWT's audience is `api.openai.com/v1`, so the OpenAI SDK talks to the normal endpoint — it just authenticates using your ChatGPT Plus session instead of a paid `sk-...` key.
- `src/tools/executors.js` writes to Supabase with the service-role key. That DB is the same one the Next.js dashboard reads from.
- After every successful write, the agent pings `DASHBOARD_URL/api/revalidate` so the Next.js server cache drops stale pages and your dashboard shows the update on next navigation without a hard refresh.

## ChatGPT token — getting one and keeping it fresh

The token is a JWT from `auth.openai.com` with scopes including `model.request`. To grab it:

1. Log into https://chatgpt.com in your browser.
2. DevTools → Application → Cookies (or Network tab). Look for the bearer token sent on requests to `chatgpt.com/backend-api/*`.
3. Copy the `eyJ...` string into `OPENAI_CHATGPT_TOKEN` in `.env`.

**Expiry:** the token expires in ~7 days. When the agent starts returning 401s, repeat the steps above. If you want automatic refresh, you'd need the `refresh_token` and the OAuth client_id — out of scope for this first version.

**Heads-up:** this usage pattern is not documented by OpenAI and may be rate-limited or revoked without notice. If it breaks, the fallback is switching `OPENAI_CHATGPT_TOKEN` for a paid platform key from https://platform.openai.com/api-keys — no other code changes needed.

## Capabilities

The agent has **full read/write access** to the CRM via Supabase. Every entity on the dashboard can be created, searched, updated, or deleted over WhatsApp. It also reads images — send a business card photo and it extracts the contact and adds the client.

### Tools (by entity)

| Entity | Create | Find | Update | Delete |
|---|---|---|---|---|
| Clients | `add_client` | `find_client` | `update_client` | `delete_client` |
| Reminders | `add_reminder` | `find_reminder` | `update_reminder` | `delete_reminder` |
| Tasks | `add_task` | `find_task` | `update_task` | `delete_task` |
| Contracts | `add_contract` | `find_contract` | `update_contract` | `delete_contract` |
| Social accounts | `add_social_account` | `find_social_account` | `update_social_account` | `delete_social_account` |
| Ad campaigns | `add_campaign` | `find_campaign` | `update_campaign` | `delete_campaign` |
| Team members | `add_team_member` | `find_team_member` | `update_team_member` | `delete_team_member` |

Plus:
- `add_client_note` — append a dated note to a client's running notes log (non-destructive, keeps all prior entries).
- `log_communication` — record a call/meeting/email log on a client.
- `add_client_service`, `remove_client_service`, `list_client_services` — manage the service tags on a client.

### Images

WhatsApp images are downloaded, converted to base64, and passed to the vision model in the same request. Examples:

- **Business card** → agent extracts name, company, phone, email, city, website → calls `add_client` with `status: "to_contact"`. The new client shows up in the dashboard's **"Clients to Contact"** section (top of `/` and a filter pill on `/clients`).
- **Contract screenshot** → extracts key fields → `find_client` then `add_contract`.
- **Social profile screenshot** → `find_client` then `add_social_account`.

Images up to 8 MB are accepted. Non-image attachments (audio, PDFs, docs) are rejected with a short reply.

### "Clients to Contact" section

`clients.status = 'to_contact'` is a new status value added by migration `003_clients_to_contact.sql`. Run it against your Supabase DB before using the flow:

```sql
-- Included in 003_clients_to_contact.sql
ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE public.clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('to_contact', 'lead', 'active', 'paused', 'completed', 'inactive'));
```

Once outreach is done, tell the agent "mark Acme as contacted" and it'll flip status to `lead` via `update_client`.

### Notes log per client

Every client has a single `notes` text field. The agent uses `add_client_note` to **prepend** entries with a date stamp — so you get a running log newest-first, no overwrites:

```
[2026-04-24] Met at GITEX. Interested in content + paid social.
[2026-04-22] Business card captured.
```

Tell the agent things like _"note for Acme: sent the proposal, waiting for Monday reply"_ and it appends that line.

### Delete safety

All `delete_*` tools are flagged destructive in the prompt. The agent summarizes what will be removed and waits for your confirmation ("yes" / "delete it") before actually calling the tool.

### Two-number setup

- The **new dedicated number** is the one the **agent runs on** — it's the WhatsApp account that scans the QR in `src/index.js`. You send commands TO this number.
- `ALLOWED_PHONE` in `.env` is your **personal number** — the only sender the agent will respond to. The filter in `src/index.js` drops everything else.

Flow: your personal phone → sends message → new-number WhatsApp account (where the agent is logged in) → agent processes → replies back to your personal phone.

## Dashboard setup (one-time)

Add this line to the Next.js app's `.env.local` (same folder as `package.json`):

```
REVALIDATE_SECRET=change-me-to-something-random
```

Use the same value in the agent's `.env`. Restart `next dev` so it picks up the env var. The endpoint is at `src/app/api/revalidate/route.ts` — it's secret-gated, so without matching `REVALIDATE_SECRET` it just returns 401.

## Local run

```bash
cd whatsapp-agent
npm install
cp .env.example .env   # fill in the values
npm start
```

A QR code will print in the terminal. Open WhatsApp on your phone → Settings → Linked devices → Link a device → scan. Session is cached in `.wwebjs_auth/`, so you only scan once.

## Deploy to Hostinger (VPS — NOT shared hosting)

Shared hosting cannot run Chromium. You need a Hostinger VPS.

### 1. VPS prep (Ubuntu)

```bash
apt update && apt install -y nodejs npm git
# Puppeteer/Chromium deps (needed for whatsapp-web.js)
apt install -y chromium-browser libnss3 libatk-bridge2.0-0 libxkbcommon0 \
  libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpangocairo-1.0-0 libasound2
# Required: model must support vision. Default is gpt-4o-mini — it does.
npm i -g pm2
```

### 2. Deploy the code

```bash
git clone <your repo> /opt/adaa
cd /opt/adaa/temp_zip_agency/whatsapp-agent
npm install
cp .env.example .env
nano .env   # fill in OPENAI_CHATGPT_TOKEN, SUPABASE_*, ALLOWED_PHONE, DASHBOARD_URL, REVALIDATE_SECRET
```

### 3. First-time auth (one-off, interactive)

QR code must be scanned once. Start in foreground:

```bash
npm start
```

Scan the QR with your phone, wait for `Agent ready`, then Ctrl+C.

### 4. Run under pm2

```bash
pm2 start src/index.js --name adaa-agent
pm2 save
pm2 startup    # follow the printed command to enable boot-start
```

Logs: `pm2 logs adaa-agent`. The `.wwebjs_auth/` folder keeps the session — don't delete it or you'll have to scan the QR again.

## Security notes

- Uses the Supabase **service role key**. Keep `.env` out of git (already in `.gitignore`).
- Only messages from `ALLOWED_PHONE` are processed. Change or extend this check in `src/index.js` if you later want a small team.
- Using WhatsApp Web via an unofficial library is against WhatsApp ToS. Low personal-volume use is usually fine, but the number could be banned. Don't use it on a number you can't afford to lose.

## Extending

Add a new capability in three steps:

1. Add a tool in `src/tools/definitions.js` using the `{ type: "function", function: {...} }` OpenAI shape.
2. Add the executor function in `src/tools/executors.js`, register it in `registry`, and if it writes data add a `revalidate([...])` call with the affected paths.
3. That's it — the model picks up the new tool automatically on next message.
