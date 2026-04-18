import { supabaseClient } from "@/lib/supabase/client"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const revalidate = 0

import { AddCampaignModal } from "./AddCampaignModal"
import { deleteCampaign } from "@/app/actions/campaigns"
import { Trash2, TrendingUp, Target, CreditCard, Calendar } from "lucide-react"

export default async function CampaignsPage() {
  const [
    { data: campaigns },
    { data: clients }
  ] = await Promise.all([
    supabaseClient.from('ad_campaigns').select('*, clients(company_name)').order('created_at', { ascending: false }),
    supabaseClient.from('clients').select('id, company_name')
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between bg-white dark:bg-gray-950 p-6 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm">
        <div>
           <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Ad Campaigns</h1>
           <p className="text-gray-500 text-sm mt-1">Track and manage active marketing campaigns and budgets</p>
        </div>
        <AddCampaignModal clients={clients || []} />
      </div>

      <div className="bg-white dark:bg-gray-950 border border-gray-100 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="py-4">Campaign Name</TableHead>
              <TableHead>Client Owner</TableHead>
              <TableHead>Financials</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(campaigns as any[])?.map((c: any) => (
              <TableRow key={c.id} className="group transition-colors hover:bg-gray-50/50 dark:hover:bg-gray-900/50">
                <TableCell className="py-4 font-medium">
                  <div className="flex flex-col">
                    <span className="font-bold text-gray-900 dark:text-gray-100">{c.name}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-1 uppercase font-bold tracking-tighter italic">
                       <Target className="h-2.5 w-2.5" /> {c.objective}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs font-semibold px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded-full">{c.clients?.company_name}</span>
                </TableCell>
                <TableCell>
                   <div className="flex flex-col">
                      <span className="font-bold text-sm text-gray-900 dark:text-gray-100">
                         {c.budget ? `${c.budget.toLocaleString()} SAR` : '-'}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] text-gray-400">
                         <CreditCard className="h-2.5 w-2.5" /> Ad Spend
                      </div>
                   </div>
                </TableCell>
                <TableCell>
                   <div className="flex flex-col text-xs text-gray-600 dark:text-gray-400">
                      <span>{c.start_date}</span>
                      <span className="text-gray-400">to {c.end_date || 'Ongoing'}</span>
                   </div>
                </TableCell>
                <TableCell>
                  <Badge variant={c.status === 'active' ? 'success' : c.status === 'completed' ? 'secondary' : c.status === 'paused' ? 'warning' : 'outline'} className="rounded-full px-3">
                    {c.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                   <form action={deleteCampaign.bind(null, c.id, c.client_id)}>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                         <Trash2 className="h-4 w-4" />
                      </Button>
                   </form>
                </TableCell>
              </TableRow>
            ))}
            {(!campaigns || campaigns.length === 0) && (
              <TableRow>
                 <TableCell colSpan={6} className="h-32 text-center text-gray-500 italic">No campaigns found.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
