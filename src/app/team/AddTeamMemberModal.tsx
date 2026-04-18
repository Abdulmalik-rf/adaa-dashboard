"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, UserPlus, Briefcase, Mail, Phone, ShieldCheck } from "lucide-react"
import { createTeamMember } from "@/app/actions/team"

export function AddTeamMemberModal({ t }: { t: any }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mx-2 h-4 w-4" /> {t.addTeamMember}
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-950 w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" /> {t.addTeamMember}
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createTeamMember(formData)
          setIsOpen(false)
        }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">{t.contactPerson}</label>
            <div className="relative">
              <UserPlus className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input name="full_name" required className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-gray-50/50" placeholder="Full Name" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="space-y-2">
                <label className="text-sm font-semibold">{t.jobTitle}</label>
                <div className="relative">
                  <Briefcase className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <input name="job_title" className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-gray-50/50" placeholder="Manager" />
                </div>
             </div>
             <div className="space-y-2">
                <label className="text-sm font-semibold">{t.role}</label>
                <div className="relative">
                  <ShieldCheck className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <select name="role" className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-gray-50/50 text-sm appearance-none">
                     <option value="admin">Admin</option>
                     <option value="manager">Manager</option>
                     <option value="employee">Employee</option>
                  </select>
                </div>
             </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">{t.emailAddress}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input name="email" type="email" required className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-gray-50/50" placeholder="email@agency.com" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold">{t.phoneNumber}</label>
            <div className="relative">
              <Phone className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input name="phone" className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-gray-50/50" placeholder="+966" />
            </div>
          </div>

          <input type="hidden" name="status" value="active" />

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary text-white">Save Member</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
