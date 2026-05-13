import { supabaseClient } from '@/lib/supabase/client'
import { NewClientWizard } from './NewClientWizard'

export const revalidate = 0

// Pulls the team-members list once on the server so the wizard's
// "weekly reports assignee" dropdown is pre-populated without an extra
// client-side fetch.
export default async function NewClientPage() {
  const { data: teamMembers } = await (supabaseClient as any)
    .from('team_members')
    .select('id, full_name, role, job_title')
    .eq('status', 'active')
    .order('full_name')
  return <NewClientWizard teamMembers={teamMembers ?? []} />
}
