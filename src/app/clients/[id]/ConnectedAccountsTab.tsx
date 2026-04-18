'use client'

import React, { useState } from 'react'
import { Plus, Check, MoreHorizontal, Edit, Trash2, Key, Mail, User, Star } from 'lucide-react'
import { setAccountAsDefault, deleteSocialAccount } from '@/app/actions/social_accounts'
import { AddSocialAccountModal } from './AddSocialAccountModal'

interface Account {
  id: string
  platform: string
  account_name: string | null
  username: string | null
  email: string | null
  external_id: string | null
  is_default: boolean
  status: string
  encrypted_password?: string | null
  notes: string | null
}

export function ConnectedAccountsTab({ clientId, initialAccounts }: { clientId: string, initialAccounts: Account[] }) {
  const [isAddModalOpen, setAddModalOpen] = useState(false)
  
  // Group platforms
  const grouped = initialAccounts.reduce((acc, account) => {
    if (!acc[account.platform]) acc[account.platform] = []
    acc[account.platform].push(account)
    return acc
  }, {} as Record<string, Account[]>)

  const platforms = ['instagram', 'tiktok', 'snapchat', 'google_ads']
  const platformIcons = {
    instagram: '📸',
    tiktok: '🎵',
    snapchat: '👻',
    google_ads: '🔍'
  }

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex justify-between items-center bg-[hsl(var(--muted)/0.3)] p-4 rounded-xl border border-[hsl(var(--border))]">
         <div>
            <h3 className="font-bold">Unified Social Connections</h3>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Manage and secure API credentials and account details across all networks.</p>
         </div>
         <button onClick={() => setAddModalOpen(true)} className="btn btn-primary btn-sm">
           <Plus className="h-4 w-4" /> Connect Account
         </button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {platforms.map(platform => {
          const accountsForPlatform = grouped[platform] || []
          
          return (
            <div key={platform} className="premium-card p-5 border border-[hsl(var(--border))] space-y-4">
              <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] pb-3">
                 <span className="text-xl">{platformIcons[platform as keyof typeof platformIcons] || '🌐'}</span>
                 <h4 className="font-bold capitalize">{platform.replace('_', ' ')}</h4>
                 <span className="badge badge-secondary ml-auto text-[10px]">{accountsForPlatform.length} Accounts</span>
              </div>

              {accountsForPlatform.length === 0 ? (
                 <div className="text-center p-6 bg-[hsl(var(--muted)/0.2)] rounded-xl border border-dashed border-[hsl(var(--border))]">
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">No connections added yet.</p>
                 </div>
              ) : (
                <div className="space-y-3">
                  {accountsForPlatform.map(account => (
                    <div key={account.id} className={`p-4 rounded-xl border ${account.is_default ? 'border-[hsl(var(--primary)/0.5)] bg-[hsl(var(--primary)/0.03)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.1)]'} relative group transition-all`}>
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                           <h5 className="font-bold text-sm">{account.account_name || account.username || 'Unnamed Account'}</h5>
                           {account.is_default && <span className="bg-[hsl(var(--primary))] text-white text-[9px] px-1.5 py-0.5 rounded-sm font-bold tracking-wider uppercase flex items-center gap-1"><Star className="h-3 w-3 fill-current" /> Primary</span>}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                           {!account.is_default && (
                             <button onClick={() => setAccountAsDefault(account.id, clientId, account.platform)} className="text-[10px] bg-[hsl(var(--muted))] hover:bg-[hsl(var(--primary))] hover:text-white px-2 py-1 rounded-md font-bold transition-colors">Make Default</button>
                           )}
                           <button onClick={() => deleteSocialAccount(account.id, clientId, account.platform)} className="text-[10px] bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white px-2 py-1 rounded-md font-bold transition-colors">Remove</button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-[11px] text-[hsl(var(--muted-foreground))]">
                        {account.username && <div className="flex items-center gap-1.5"><User className="h-3 w-3" /> @{account.username}</div>}
                        {account.email && <div className="flex items-center gap-1.5 truncate"><Mail className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{account.email}</span></div>}
                        {account.external_id && <div className="flex items-center gap-1.5"><Key className="h-3 w-3" /> ID: {account.external_id}</div>}
                        {account.encrypted_password && <div className="flex items-center gap-1.5 text-orange-500"><Key className="h-3 w-3" /> Encrypted Creds</div>}
                      </div>
                      
                      {account.notes && (
                         <p className="text-[11px] mt-3 pt-2 border-t border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] italic">
                           Note: {account.notes}
                         </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {isAddModalOpen && <AddSocialAccountModal clientId={clientId} onClose={() => setAddModalOpen(false)} />}
    </div>
  )
}
