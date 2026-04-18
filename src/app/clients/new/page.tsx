import { createClient } from "@/app/actions/clients"
import Link from "next/link"
import { ArrowLeft, Building2, User, Mail, Phone, MapPin, Briefcase } from "lucide-react"

export default function NewClientPage() {
  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-8">
      <div className="flex items-center gap-4 section-header mb-0 border-b-0 pb-0">
        <Link href="/clients" className="btn btn-ghost btn-icon">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Add New Client</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Create a new client profile and workspace</p>
        </div>
      </div>

      <div className="premium-card p-6">
        <form action={createClient} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">Company Details</h3>
              
              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Company Name</label>
                <input type="text" name="company_name" required className="form-input" placeholder="e.g. Acme Corp" />
              </div>

              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><Briefcase className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Industry</label>
                <input type="text" name="business_type" className="form-input" placeholder="e.g. Real Estate, E-commerce" />
              </div>

              <div className="form-group">
                <label className="form-label">Client Status</label>
                <select name="status" className="form-input">
                  <option value="lead">Lead (Prospect)</option>
                  <option value="active">Active Client</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-sm border-b border-[hsl(var(--border))] pb-2">Contact Information</h3>

              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Primary Contact</label>
                <input type="text" name="full_name" required className="form-input" placeholder="Full name of representative" />
              </div>

              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Email Address</label>
                <input type="email" name="email" className="form-input" placeholder="contact@company.com" />
              </div>

              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> Phone Number</label>
                <input type="tel" name="phone" className="form-input" placeholder="+966 5X XXX XXXX" />
              </div>

              <div className="form-group">
                <label className="form-label flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-[hsl(var(--primary))]" /> City / Location</label>
                <input type="text" name="city" className="form-input" placeholder="e.g. Riyadh" />
              </div>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-[hsl(var(--border))] flex justify-end gap-3">
            <Link href="/clients" className="btn btn-secondary">Cancel</Link>
            <button type="submit" className="btn btn-primary">Create Client</button>
          </div>
        </form>
      </div>
    </div>
  )
}
