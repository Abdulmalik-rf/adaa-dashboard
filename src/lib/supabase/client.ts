import { createClient } from '@supabase/supabase-js'
import { mockSupabaseClient } from './mockClient'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'

const isMock =
  !supabaseUrl ||
  supabaseUrl.includes('your-project') ||
  supabaseUrl === 'http://localhost:54321' ||
  supabaseAnonKey === 'your-anon-key'

export const supabaseClient = isMock
  ? (mockSupabaseClient as any)
  : createClient(supabaseUrl, supabaseAnonKey)
