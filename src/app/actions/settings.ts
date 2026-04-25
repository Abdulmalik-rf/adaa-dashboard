'use server'

import { revalidatePath } from 'next/cache'
import { supabaseClient } from '@/lib/supabase/client'

// Mirrors src/app/actions/social_accounts.ts — same scheme so swapping to
// real crypto later only needs one place changed. NOT real crypto; do not
// rely on it for anything sensitive.
function mockSecureEncrypt(text: string | null): string | null {
  if (!text) return null
  return `enc__${Buffer.from(text).toString('base64')}__secure`
}

const SETTINGS_ID = 'default'

export async function saveAgencyProfile(formData: FormData) {
  const agencyName = (formData.get('agency_name') as string | null)?.trim() || null
  const supportEmail = (formData.get('support_email') as string | null)?.trim() || null

  const { error } = await (supabaseClient as any)
    .from('agency_settings')
    .upsert(
      {
        id: SETTINGS_ID,
        agency_name: agencyName,
        support_email: supportEmail,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

  if (error) {
    console.error('Error saving agency profile:', error)
    throw new Error('Failed to save agency profile')
  }
  revalidatePath('/settings')
}

export async function saveWhatsAppConfig(formData: FormData) {
  const provider = (formData.get('whatsapp_provider') as string | null) || null
  const rawToken = (formData.get('whatsapp_api_token') as string | null) || ''

  const patch: Record<string, unknown> = {
    id: SETTINGS_ID,
    whatsapp_provider: provider,
    updated_at: new Date().toISOString(),
  }
  // Only rotate the token if the user typed something — leaving it blank
  // keeps the existing one.
  if (rawToken.trim() !== '') {
    patch.whatsapp_api_token_encrypted = mockSecureEncrypt(rawToken.trim())
  }

  const { error } = await (supabaseClient as any)
    .from('agency_settings')
    .upsert(patch, { onConflict: 'id' })

  if (error) {
    console.error('Error saving WhatsApp config:', error)
    throw new Error('Failed to save WhatsApp config')
  }
  revalidatePath('/settings')
}
