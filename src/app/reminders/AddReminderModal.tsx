"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, Bell, Building, Calendar, AlertCircle } from "lucide-react"
import { createReminder } from "@/app/actions/reminders"

export function AddReminderModal({ clients }: { clients: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> New Reminder
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" /> Create Remark/Reminder
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createReminder(formData)
          setIsOpen(false)
        }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">Reminder / Note</label>
            <textarea name="title" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="e.g. Follow up on the new contract" />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
               <Building className="h-3 w-3" /> Client
            </label>
            <select name="client_id" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
               <option value="">Select Client</option>
               {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <Calendar className="h-3 w-3" /> Due Date
                </label>
                <input name="due_date" type="date" required className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-transparent text-sm" />
             </div>
             <div className="space-y-2">
                <label className="text-sm font-semibold flex items-center gap-2">
                   <AlertCircle className="h-3 w-3" /> Priority
                </label>
                <select name="priority" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
                   <option value="low">Low</option>
                   <option value="medium" selected>Medium</option>
                   <option value="high">High</option>
                </select>
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">Type</label>
            <select name="type" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
               <option value="Follow-up">Follow-up</option>
               <option value="Payment">Payment</option>
               <option value="Meeting">Meeting</option>
               <option value="Other">Other</option>
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary text-white">Save Reminder</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
