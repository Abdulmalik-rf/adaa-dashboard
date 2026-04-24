import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Service-role client used ONLY by the in-dashboard chat agent. Separate from
// the dashboard's per-request SSR client which uses the anon key.
let _client: SupabaseClient | null = null

export function agentSupabase(): SupabaseClient {
  if (_client) return _client
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error(
      'chat-agent: missing SUPABASE_URL and/or SUPABASE_SERVICE_ROLE_KEY env var',
    )
  }
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}
