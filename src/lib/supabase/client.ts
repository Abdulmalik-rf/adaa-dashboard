import { createClient } from '@supabase/supabase-js'
import { mockSupabaseClient } from './mockClient'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

const isMock =
  !SUPABASE_URL ||
  SUPABASE_URL.includes('your-project') ||
  SUPABASE_URL === 'http://localhost:54321' ||
  SUPABASE_ANON_KEY === 'your-anon-key'

export const supabaseClient = isMock
  ? (mockSupabaseClient as any)
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
