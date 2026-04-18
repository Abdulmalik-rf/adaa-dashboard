// Supabase public project credentials.
// The anon/publishable key is designed to be exposed to the browser.
// Real access control is enforced by RLS + the proxy.ts auth guard.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://ddiaetxjjsobwkrapxnt.supabase.co'

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_2dRH7Gan37TZHRVnrZzmQw_GpLpmaPC'
