"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, X, Upload, File, Building } from "lucide-react"
import { createFileRecord } from "@/app/actions/files"

export function UploadFileModal({ clients }: { clients: any[] }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)}>
        <Plus className="mr-2 h-4 w-4" /> Upload File
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-950 w-full max-w-md rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b dark:border-gray-800">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" /> Upload File
          </h2>
          <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form action={async (formData) => {
          await createFileRecord(formData)
          setIsOpen(false)
        }} className="p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-semibold">File Name</label>
            <div className="relative">
              <File className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input name="name" required className="w-full p-2.5 pl-10 border rounded-xl dark:bg-gray-900 bg-transparent" placeholder="e.g. Contract-2024.pdf" />
            </div>
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

          <div className="space-y-2">
            <label className="text-sm font-semibold">Category</label>
            <select name="category" className="w-full p-2.5 border rounded-xl dark:bg-gray-900 bg-gray-50/50 appearance-none text-sm">
               <option value="Document">Document</option>
               <option value="Asset">Asset</option>
               <option value="Contract">Contract</option>
               <option value="Branding">Branding</option>
            </select>
          </div>

          <div className="pt-4 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setIsOpen(false)}>Cancel</Button>
            <Button type="submit" className="flex-1 bg-primary text-white">Save Record</Button>
          </div>
        </form>
      </div>
    </div>
  )
}
