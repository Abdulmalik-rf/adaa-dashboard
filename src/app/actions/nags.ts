'use server'

// Server actions for the overdue-invoice nag review page.
//
// The scheduler creates drafts in invoice_nag_log with status='pending'.
// From the dashboard the admin can:
//   - sendNagByEmail(id, body) — fires Resend directly (server-side),
//     flips status='sent', records channel='email' + sent_at.
//   - skipNag(id)              — admin doesn't want to nag (flips to 'skipped').
//   - rejectNag(id)            — admin actively rejected the draft (flips 'admin_rejected').
//
// WhatsApp sends still happen via the agent process (Baileys socket lives
// there, not in Next.js). Admin replies "send" on WhatsApp to fire WA;
// the dashboard just shows the draft + a hint for that path.

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { revalidatePath } from 'next/cache'

const sb = () => agentSupabase()

export async function sendNagByEmail(
  id: string,
  editedBody: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

  // Pull the nag + linked invoice + client so we can address the email.
  const { data: nag } = await sb()
    .from('invoice_nag_log')
    .select(`
      id, status, stage, invoice_id,
      invoice:invoice_id (id, invoice_number, customer_name, client_id, total, currency)
    `).eq('id', id).maybeSingle()
  if (!nag) return { ok: false, error: 'Nag not found.' }
  if ((nag as any).status !== 'pending') {
    return { ok: false, error: `Cannot send — current status is ${(nag as any).status}.` }
  }
  const inv = (nag as any).invoice
  if (!inv) return { ok: false, error: 'Linked invoice missing.' }

  // Resolve recipient email from clients table (denormalised customer_name
  // is fine for the subject but we still need a real email address).
  let toEmail: string | null = null
  let companyName: string | null = inv.customer_name ?? null
  if (inv.client_id) {
    const { data: c } = await sb()
      .from('clients').select('email, company_name, full_name')
      .eq('id', inv.client_id).maybeSingle()
    if (c) {
      toEmail = (c as any).email ?? null
      companyName = (c as any).company_name || (c as any).full_name || companyName
    }
  }
  if (!toEmail) {
    return { ok: false, error: 'Client has no email on file. Add one in the client record or use the WhatsApp path.' }
  }

  const amount = `${Number(inv.total ?? 0).toLocaleString('en-US')} ${inv.currency || 'SAR'}`
  const subject = `Payment reminder — ${inv.invoice_number} (${amount})`

  const r = await sendEmail({
    to: toEmail,
    subject,
    text: editedBody,
  })
  if (!r.ok) return { ok: false, error: r.error ?? 'Email send failed.' }

  await sb().from('invoice_nag_log').update({
    status: 'sent',
    channel: 'email',
    draft_text: editedBody,
    sent_at: new Date().toISOString(),
    admin_user_id: me.id,
  }).eq('id', id).eq('status', 'pending')

  revalidatePath('/accounting/nags')
  return { ok: true }
}

export async function skipNag(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const { error } = await sb().from('invoice_nag_log').update({
    status: 'skipped',
    admin_user_id: me.id,
  }).eq('id', id).eq('status', 'pending')
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/nags')
  return { ok: true }
}

export async function rejectNag(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const { error } = await sb().from('invoice_nag_log').update({
    status: 'admin_rejected',
    admin_user_id: me.id,
  }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/nags')
  return { ok: true }
}

export async function editDraftNag(
  id: string,
  draft: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const { error } = await sb().from('invoice_nag_log').update({ draft_text: draft }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/nags')
  return { ok: true }
}
