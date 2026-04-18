'use client'

import React, { useState } from 'react'
import { X, Lock, Globe, User, Mail, Tag, AlignLeft } from 'lucide-react'
import { addSocialAccount } from '@/app/actions/social_accounts'

export function AddSocialAccountModal({ clientId, onClose }: { clientId: string, onClose: () => void }) {
  const [platform, setPlatform] = useState('instagram')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setLoading(true)
    const formData = new FormData(e.currentTarget)
    formData.append('client_id', clientId)
    
    try {
      await addSocialAccount(formData)
      onClose()
    } catch (err) {
      console.error(err)
      alert("Failed to add account. Check console.")
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      
      <div className="bg-[hsl(var(--card))] w-full max-w-lg rounded-3xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden relative z-10 animate-modal-enter">
        <div className="flex items-center justify-between p-6 border-b border-[hsl(var(--border))]">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Globe className="h-5 w-5 text-[hsl(var(--primary))]" /> 
            Connect Social Account
          </h2>
          <button onClick={onClose} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors p-1">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="form-label text-xs uppercase tracking-wider">Platform</label>
            <select name="platform" className="form-input font-bold" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="snapchat">Snapchat</option>
              <option value="google_ads">Google Ads</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label text-xs uppercase tracking-wider flex items-center gap-1.5"><Tag className="h-3 w-3"/> Display Name</label>
              <input name="account_name" required className="form-input text-sm" placeholder="e.g. Official Page" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label text-xs uppercase tracking-wider flex items-center gap-1.5"><User className="h-3 w-3"/> Username</label>
              <input name="username" className="form-input text-sm" placeholder="@handle" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="form-label text-xs uppercase tracking-wider flex items-center gap-1.5"><Mail className="h-3 w-3"/> Login Email</label>
              <input name="email" type="email" className="form-input text-sm" placeholder="email@example.com" />
            </div>
            <div className="space-y-1.5">
              <label className="form-label text-xs uppercase tracking-wider flex items-center gap-1.5 text-orange-500"><Lock className="h-3 w-3"/> Password (Encrypted)</label>
              <input name="password" type="password" className="form-input text-sm focus:border-orange-500 focus:ring-orange-500/20" placeholder="••••••••" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="form-label text-xs uppercase tracking-wider">External / API ID (Optional)</label>
            <input name="external_id" className="form-input text-sm font-mono" placeholder="e.g. Google Ads MCC ID or TikTok Token" />
          </div>

          <div className="space-y-1.5">
            <label className="form-label text-xs uppercase tracking-wider flex items-center gap-1.5"><AlignLeft className="h-3 w-3"/> Internal Notes</label>
            <input name="notes" className="form-input text-sm" placeholder="Connection context or MFA details..." />
          </div>

          <div className="flex items-center gap-3 p-4 bg-[hsl(var(--muted)/0.5)] rounded-xl border border-[hsl(var(--border))]">
            <input type="checkbox" name="is_default" id="is_default" value="true" className="w-5 h-5 rounded text-[hsl(var(--primary))] bg-[hsl(var(--card))] border-[hsl(var(--border))]" />
            <label htmlFor="is_default" className="text-sm font-bold cursor-pointer select-none">
              Set as Default Account for {platform.replace('_', ' ').toUpperCase()}
            </label>
          </div>

          <div className="pt-4 flex gap-3">
            <button type="button" onClick={onClose} disabled={loading} className="btn btn-secondary flex-1">
               Cancel
            </button>
            <button type="submit" disabled={loading} className="btn btn-primary flex-1">
               {loading ? 'Adding...' : 'Securely Connect Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
