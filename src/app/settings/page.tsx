import { supabaseClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { saveAgencyProfile, saveWhatsAppConfig } from "@/app/actions/settings"
import { saveQoyodConfig as saveQoyodConfigInner } from "@/app/actions/invoices"
import { QoyodConnectionTester } from "./QoyodConnectionTester"

// React form action expects a void-returning function. The underlying action
// returns { ok, error? } so the page can react to it later; for now we
// fire-and-forget. Errors land in the server log; the test-connection
// button surfaces actual usage issues.
async function saveQoyodConfig(formData: FormData): Promise<void> {
  'use server'
  await saveQoyodConfigInner(formData)
}

export const revalidate = 0

type Settings = {
  agency_name: string | null
  support_email: string | null
  whatsapp_provider: string | null
  whatsapp_api_token_encrypted: string | null
  qoyod_api_key: string | null
  qoyod_default_inventory_id: number | null
  qoyod_default_revenue_account: number | null
  qoyod_default_payment_account: number | null
  qoyod_org_name: string | null
}

export default async function SettingsPage() {
  const { data } = await (supabaseClient as any)
    .from('agency_settings')
    .select('agency_name, support_email, whatsapp_provider, whatsapp_api_token_encrypted, qoyod_api_key, qoyod_default_inventory_id, qoyod_default_revenue_account, qoyod_default_payment_account, qoyod_org_name')
    .eq('id', 'default')
    .maybeSingle()

  const settings: Settings = data ?? {
    agency_name: null, support_email: null, whatsapp_provider: null, whatsapp_api_token_encrypted: null,
    qoyod_api_key: null, qoyod_default_inventory_id: null, qoyod_default_revenue_account: null,
    qoyod_default_payment_account: null, qoyod_org_name: null,
  }
  const hasToken = !!settings.whatsapp_api_token_encrypted
  const hasQoyod = !!settings.qoyod_api_key

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
                  className="h-9 w-full rounded-md border border-gray-200 bg-white text-gray-900 px-3 py-1 text-sm shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100"
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
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
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
                  placeholder="Emergize Agency"
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Support Email</label>
                <input
                  type="email"
                  name="support_email"
                  defaultValue={settings.support_email ?? ''}
                  placeholder="support@emergize.sa"
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                />
              </div>
              <Button type="submit">Update Profile</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Accounting — Qoyod (قيود)</CardTitle>
            <CardDescription>
              Connects the dashboard&apos;s VAT invoice workflow to your Qoyod account. Get the API key from your Qoyod dashboard → Settings → API. Saved keys are stored encrypted at rest. Optional inventory + account IDs avoid prompting on every push; fetch them via <code>GET /accounts</code> / <code>GET /inventories</code> using your key.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={saveQoyodConfig} className="space-y-4">
              <div className="grid gap-2">
                <label className="text-sm font-medium">
                  API Key {hasQoyod && <span className="text-xs text-emerald-600 font-normal ml-2">(set — leave blank to keep)</span>}
                </label>
                <input
                  type="password"
                  name="qoyod_api_key"
                  placeholder={hasQoyod ? 'Enter new key to rotate…' : 'API-KEY from Qoyod Settings → API'}
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium">Organization Name (optional, display only)</label>
                <input
                  type="text"
                  name="qoyod_org_name"
                  defaultValue={settings.qoyod_org_name ?? ''}
                  placeholder="Emergize Marketing Services"
                  className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Inventory ID</label>
                  <input
                    type="number" min="1"
                    name="qoyod_default_inventory_id"
                    defaultValue={settings.qoyod_default_inventory_id ?? ''}
                    placeholder="e.g. 1"
                    className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Revenue Account ID</label>
                  <input
                    type="number" min="1"
                    name="qoyod_default_revenue_account"
                    defaultValue={settings.qoyod_default_revenue_account ?? ''}
                    placeholder="e.g. 7"
                    className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Payment Account ID</label>
                  <input
                    type="number" min="1"
                    name="qoyod_default_payment_account"
                    defaultValue={settings.qoyod_default_payment_account ?? ''}
                    placeholder="e.g. 12 (bank account)"
                    className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-slate-700"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button type="submit">Save Qoyod Config</Button>
                <QoyodConnectionTester hasKey={hasQoyod} />
              </div>
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
