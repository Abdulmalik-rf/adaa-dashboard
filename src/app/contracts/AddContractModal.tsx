"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, FileSignature, Building, Calendar, DollarSign } from "lucide-react"
import { createContract } from "@/app/actions/contracts"

export function AddContractModal({ clients }: { clients: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> New Contract
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 w-full max-w-lg rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <FileSignature className="h-5 w-5 text-primary" /> Create Contract
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createContract(formData)
          setIsOpen(false)
        }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Contract Title</label>
            <input name="title" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="e.g. Social Media Management 2024" />
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
                <label className="text-sm font-semibold">Type</label>
                <select name="contract_type" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
                   <option value="Retainer">Retainer</option>
                   <option value="Project">Project</option>
                   <option value="One-time">One-time</option>
                </select>
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

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
               <DollarSign className="h-3 w-3" /> Monthly/Total Value (SAR)
            </label>
            <input name="value" type="number" step="0.01" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="0.00" />
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary text-white">Save Contract</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
