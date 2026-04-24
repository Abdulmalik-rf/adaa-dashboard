'use server'

import { revalidatePath } from 'next/cache'
import { supabaseClient } from '@/lib/supabase/client'

// Simplified mock encryption/decryption for demonstration
// In production, use standard crypto (AES-256-GCM) with an environment variable key.
function mockSecureEncrypt(text: string | null): string | null {
  if (!text) return null
  return `enc__${Buffer.from(text).toString('base64')}__secure`
}

function mockSecureDecrypt(text: string | null): string | null {
  if (!text || !text.startsWith('enc__')) return null
  try {
    const b64 = text.replace('enc__', '').replace('__secure', '')
    return Buffer.from(b64, 'base64').toString('utf-8')
  } catch {
    return null
  }
}

export async function addSocialAccount(formData: FormData) {
  const clientId = formData.get('client_id') as string
  const platform = formData.get('platform') as string
  const isDefault = formData.get('is_default') === 'true'
  
  const payload = {
    client_id: clientId,
    platform: platform,
    account_name: formData.get('account_name') || null,
    username: formData.get('username') || null,
    email: formData.get('email') || null,
    external_id: formData.get('external_id') || null,
    notes: formData.get('notes') || '',
    is_default: isDefault,
    status: formData.get('status') || 'active',
  }

  const rawPassword = formData.get('password') as string
  const encrypted_password = mockSecureEncrypt(rawPassword)

  // If making this the default, disable default on others for this specific platform and client
  if (isDefault) {
    await supabaseClient
      .from('social_accounts')
      .update({ is_default: false })
      .eq('client_id', clientId)
      .eq('platform', platform)
  }

  const { error } = await supabaseClient.from('social_accounts').insert([
    { ...payload, encrypted_password }
  ])

  if (error) {
    console.error('Error adding social account:', error)
    throw new Error('Failed to add social account')
  }

  revalidatePath(`/clients/${clientId}`)
}

export async function updateSocialAccount(id: string, formData: FormData) {
  const clientId = formData.get('client_id') as string
  const platform = formData.get('platform') as string
  const isDefault = formData.get('is_default') === 'true'

  const payload: any = {
    account_name: formData.get('account_name') || null,
    username: formData.get('username') || null,
    email: formData.get('email') || null,
    external_id: formData.get('external_id') || null,
    notes: formData.get('notes') || '',
    status: formData.get('status') || 'active',
  }

  const rawPassword = formData.get('password') as string
  if (rawPassword && rawPassword.trim() !== '') {
    // Only update password if a new one is provided.
    payload.encrypted_password = mockSecureEncrypt(rawPassword)
  }

  if (isDefault) {
    payload.is_default = true
    await supabaseClient
      .from('social_accounts')
      .update({ is_default: false })
      .eq('client_id', clientId)
      .eq('platform', platform)
  } else {
    payload.is_default = false
  }

  const { error } = await supabaseClient.from('social_accounts').update(payload).eq('id', id)

  if (error) {
    console.error('Error updating social account:', error)
    throw new Error('Failed to update social account')
  }

  revalidatePath(`/clients/${clientId}`)
}

export async function deleteSocialAccount(id: string, clientId: string, platform: string) {
  const { error } = await supabaseClient.from('social_accounts').delete().eq('id', id)
  if (error) {
    console.error('Error deleting social account:', error)
    throw new Error('Failed to delete social account')
  }
  revalidatePath(`/clients/${clientId}`)
}

export async function setAccountAsDefault(id: string, clientId: string, platform: string) {
  // First remove default from all
  await supabaseClient
    .from('social_accounts')
    .update({ is_default: false })
    .eq('client_id', clientId)
    .eq('platform', platform)

  // Set the specified one to default
  const { error } = await supabaseClient
    .from('social_accounts')
    .update({ is_default: true })
    .eq('id', id)

  if (error) {
    throw new Error('Failed to set default account')
  }

  revalidatePath(`/clients/${clientId}`)
}
