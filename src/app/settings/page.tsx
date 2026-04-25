import { supabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { saveAgencyProfile, saveWhatsAppConfig } from "@/app/actions/settings"

export const revalidate = 0

type Settings = {
  agency_name: string | null
  support_email: string | null
  whatsapp_provider: string | null
  whatsapp_api_token_encrypted: string | null
}

export default async function SettingsPage() {
  const { data } = await (supabaseClient as any)
    .from('agency_settings')
    .select('agency_name, support_email, whatsapp_provider, whatsapp_api_token_encrypted')
    .eq('id', 'default')
    .maybeSingle()

  const settings: Settings = data ?? {
    agency_name: null, support_email: null, whatsapp_provider: null, whatsapp_api_token_encrypted: null,
  }
  const hasToken = !!settings.whatsapp_api_token_encrypted

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Settings</h1>

      <div className="grid gap-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp API Configuration</CardTitle>
            <CardDescription>Configure your provider settings for automated WhatsApp notifications later.</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveWhatsAppConfig} className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Provider</label>
                <select
                  name="whatsapp_provider"
                  defaultValue={settings.whatsapp_provider ?? 'twilio'}
                  className="h-9 w-full rounded-md border border-gray-200 bg-white text-gray-900 px-3 py-1 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100"
                >
                  <option value="twilio" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">Twilio</option>
                  <option value="meta" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">Meta Cloud API</option>
                  <option value="apiwha" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">APIWHA (Custom)</option>
                </select>
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  API Token {hasToken && <span className="text-xs text-emerald-600 font-normal ml-2">(set — leave blank to keep)</span>}
                </label>
                <input
                  type="password"
                  name="whatsapp_api_token"
                  placeholder={hasToken ? 'Enter new token to rotate…' : 'Enter API token…'}
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800"
                />
              </div>
              <Button type="submit">Save Configuration</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agency Profile</CardTitle>
            <CardDescription>Manage agency details globally</CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveAgencyProfile} className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">Agency Name</label>
                <input
                  type="text"
                  name="agency_name"
                  defaultValue={settings.agency_name ?? ''}
                  placeholder="Adaa Agency"
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Support Email</label>
                <input
                  type="email"
                  name="support_email"
                  defaultValue={settings.support_email ?? ''}
                  placeholder="support@adaa.sa"
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800"
                />
              </div>
              <Button type="submit">Update Profile</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System Maintenance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">Database schema and seeding can be triggered via Supabase SQL editor using the provided schema.sql file.</p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
