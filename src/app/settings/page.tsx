import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Settings</h1>
      
      <div className="grid gap-6 max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>WhatsApp API Configuration</CardTitle>
            <CardDescription>Configure your provider settings for automated WhatsApp notifications later.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Provider</label>
              <select className="h-9 w-full rounded-md border border-gray-200 bg-white text-gray-900 px-3 py-1 text-sm shadow-sm dark:border-gray-800 dark:bg-gray-950 dark:text-gray-100">
                <option value="twilio" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">Twilio</option>
                <option value="meta" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">Meta Cloud API</option>
                <option value="apiwwh" className="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">APIWHA (Custom)</option>
              </select>
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">API Token</label>
              <input type="password" placeholder="Enter API token..." className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800" />
            </div>
            <Button>Save Configuration</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Agency Profile</CardTitle>
            <CardDescription>Manage agency details globally</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">Agency Name</label>
              <input type="text" defaultValue="TechNova Agency" className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800" />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">Support Email</label>
              <input type="email" defaultValue="support@technova.sa" className="h-9 w-full rounded-md border border-gray-200 bg-transparent px-3 py-1 text-sm shadow-sm dark:border-gray-800" />
            </div>
            <Button>Update Profile</Button>
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
