import { supabaseClient } from "@/lib/supabase/client"
import { getDictionary } from "@/lib/i18n"
import SmartCreatorForm from "./SmartCreatorForm"

export const revalidate = 0

export default async function NewContentPage() {
  const t = await getDictionary()

  const [
    { data: clients },
    { data: teamMembers }
  ] = await Promise.all([
    (supabaseClient as any).from('clients').select('id, company_name, business_type'),
    (supabaseClient as any).from('team_members').select('id, full_name, role')
  ])

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 flex items-center gap-2">
          ✨ Intelligent Content Creator
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Your AI Strategist is ready. Let's craft viral, highly-converting content together.
        </p>
      </div>

      <SmartCreatorForm clients={clients || []} teamMembers={teamMembers || []} t={t} />
    </div>
  )
}
