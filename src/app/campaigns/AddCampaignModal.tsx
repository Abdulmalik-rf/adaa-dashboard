"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, TrendingUp, Building, Calendar, DollarSign, Target } from "lucide-react"
import { createCampaign } from "@/app/actions/campaigns"

export function AddCampaignModal({ clients }: { clients: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> New Campaign
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" /> Create Ad Campaign
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createCampaign(formData)
          setIsOpen(false)
        }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Campaign Name</label>
            <input name="name" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="e.g. Ramadan Special Offer" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
               <Target className="h-3 w-3" /> Objective
            </label>
            <input name="objective" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="e.g. Lead Generation / Brand Awareness" />
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <Building className="h-3 w-3" /> Client
                </label>
                <select name="client_id" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
                   <option value="">Select Client</option>
                   {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
             </div>
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <DollarSign className="h-3 w-3" /> Budget (SAR)
                </label>
                <input name="budget" type="number" step="0.01" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="0.00" />
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <Calendar className="h-3 w-3" /> Start Date
                </label>
                <input name="start_date" type="date" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent text-sm" />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <Calendar className="h-3 w-3" /> End Date
                </label>
                <input name="end_date" type="date" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent text-sm" />
             </div>
          </div>

          <input type="hidden" name="status" value="active" />

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary text-white">Launch Campaign</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
