import { supabase } from '../supabase.js'
import { revalidate } from '../revalidate.js'
import { rememberFact, forgetFact } from '../memory-store.js'
import { generateQuotationPdf } from '../quotation-pdf.js'
import { getSock, isReady } from '../sock-holder.js'
import { getRequest } from '../context.js'
import {
  devReadFile,
  devWriteFile,
  devEditFile,
  devListDir,
  devGlob,
  devGrep,
  devRunShell,
  devProjectRoot,
  PROJECT_ROOT,
} from './dev-tools.js'
import fs from 'node:fs/promises'
import nodePath from 'node:path'
import nodeChildProcess from 'node:child_process'

// =============================================================================
// HELPERS
// =============================================================================

// Normalize a free-form phone (e.g. "+966 54 138 8964", "0577602467",
// "966577602467") to a WhatsApp JID. Default country is Saudi Arabia (966)
// for leading-zero local format. Returns null on inputs too short to be valid.
function phoneToJid(raw, defaultCountry = '966') {
  if (!raw) return null
  let digits = String(raw).replace(/\D/g, '')
  if (!digits) return null
  // "0577602467" → "966577602467" (drop the leading 0, prepend country code)
  if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1)
  if (digits.length < 8) return null
  return `${digits}@s.whatsapp.net`
}

// Only include fields that were actually provided. Strips undefined/null/'' so
// Supabase updates only what the agent specified.
function pickDefined(input, fields) {
  const patch = {}
  for (const f of fields) {
    if (input[f] !== undefined && input[f] !== null && input[f] !== '') {
      patch[f] = input[f]
    }
  }
  return patch
}

async function findOneTeamMemberIdByName(name) {
  if (!name) return null
  const { data, error } = await supabase
    .from('team_members')
    .select('id, full_name')
    .ilike('full_name', `%${name}%`)
    .limit(1)
  if (error) throw new Error(`team_members lookup failed: ${error.message}`)
  return data?.[0]?.id ?? null
}

async function resolveClientIdByName(companyName) {
  if (!companyName) return null
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .ilike('company_name', `%${companyName}%`)
    .limit(1)
  if (error) throw new Error(`clients lookup failed: ${error.message}`)
  return data?.[0]?.id ?? null
}

async function resolveContractIdByTitle(title) {
  if (!title) return null
  const { data, error } = await supabase
    .from('contracts')
    .select('id')
    .ilike('title', `%${title}%`)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(`contracts lookup failed: ${error.message}`)
  return data?.[0]?.id ?? null
}

async function getClientIdForContract(contractId) {
  if (!contractId) return null
  const { data } = await supabase
    .from('contracts').select('client_id').eq('id', contractId).maybeSingle()
  return data?.client_id ?? null
}

// =============================================================================
// CLIENTS
// =============================================================================

async function addClient(input) {
  const row = {
    company_name: input.company_name,
    full_name: input.full_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    city: input.city ?? null,
    business_type: input.business_type ?? null,
    status: input.status ?? 'lead',
    notes: input.notes ?? null,
    website_url: input.website_url ?? null,
    start_date: new Date().toISOString().split('T')[0],
  }
  const { data, error } = await supabase.from('clients').insert(row).select().single()
  if (error) throw new Error(`insert clients failed: ${error.message}`)
  await revalidate(['/clients', '/'])
  return { id: data.id, company_name: data.company_name, status: data.status }
}

async function findClient(input) {
  const { data, error } = await supabase
    .from('clients')
    .select('id, company_name, full_name, status, city')
    .or(`company_name.ilike.%${input.query}%,full_name.ilike.%${input.query}%`)
    .limit(5)
  if (error) throw new Error(`clients search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateClient(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'company_name', 'full_name', 'email', 'phone', 'whatsapp',
    'city', 'business_type', 'status', 'notes', 'website_url',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('clients').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update clients failed: ${error.message}`)
  await revalidate(['/clients', `/clients/${id}`, '/'])
  return { id: data.id, updated_fields: Object.keys(patch), company_name: data.company_name }
}

async function addClientNote(input) {
  // Fetch existing notes, prepend the new one with a date stamp so the log
  // reads newest-first. Empty notes → just the new entry.
  const { data: existing, error: fetchErr } = await supabase
    .from('clients')
    .select('notes, company_name')
    .eq('id', input.id)
    .single()
  if (fetchErr) throw new Error(`clients fetch failed: ${fetchErr.message}`)

  const today = new Date().toISOString().split('T')[0]
  const entry = `[${today}] ${input.note}`
  const merged = existing.notes ? `${entry}\n\n${existing.notes}` : entry

  const { error } = await supabase
    .from('clients').update({ notes: merged }).eq('id', input.id)
  if (error) throw new Error(`update clients notes failed: ${error.message}`)
  await revalidate([`/clients/${input.id}`, '/clients'])
  return { id: input.id, company_name: existing.company_name, note_added: entry }
}

async function deleteClient(input) {
  const { error } = await supabase.from('clients').delete().eq('id', input.id)
  if (error) throw new Error(`delete clients failed: ${error.message}`)
  await revalidate(['/clients', '/'])
  return { deleted: input.id }
}

// =============================================================================
// REMINDERS
// =============================================================================

async function addReminder(input) {
  const client_id = await resolveClientIdByName(input.client_company_name)
  // Previously we returned early when client_company_name was supplied but the
  // client wasn't found, which left the reminder unsaved and the scheduler with
  // nothing to fire. Now we always insert; the reminder just lands unlinked.
  const unlinkedWarning =
    input.client_company_name && !client_id
      ? `Note: no client matched "${input.client_company_name}" — reminder saved but not linked to a client.`
      : null

  // Tag this reminder with whoever asked for it so the scheduler fires it
  // back to the same WhatsApp user. Falls back to NULL when called from a
  // non-request context (e.g. dashboard chat widget) — scheduler treats
  // NULL as "use the default first-user JID".
  //
  // If notify_phone is supplied, route the reminder to THAT number instead
  // (e.g. "remind +966555555555 to send the invoice tomorrow at 9am"). The
  // scheduler doesn't require notify_jid to be in the allowlist — it sends
  // to whatever JID is set on the row.
  const overrideJid = phoneToJid(input.notify_phone)
  const notify_jid = overrideJid ?? (getRequest()?.senderJid ?? null)

  const row = {
    client_id,
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    due_date: input.due_date,
    due_time: input.due_time ?? null,
    priority: input.priority ?? 'medium',
    status: 'pending',
    notify_jid,
  }
  const { data, error } = await supabase.from('reminders').insert(row).select().single()
  if (error) throw new Error(`insert reminders failed: ${error.message}`)
  const paths = ['/reminders', '/']
  if (client_id) paths.push(`/clients/${client_id}`)
  await revalidate(paths)
  return {
    id: data.id,
    title: data.title,
    due_date: data.due_date,
    due_time: data.due_time,
    linked_client_id: client_id,
    ...(unlinkedWarning ? { warning: unlinkedWarning } : {}),
  }
}

async function findReminder(input) {
  let q = supabase
    .from('reminders')
    .select('id, title, due_date, status, priority, client_id')
    .ilike('title', `%${input.query}%`)
    .limit(5)
  if (input.only_pending) q = q.eq('status', 'pending')
  const { data, error } = await q
  if (error) throw new Error(`reminders search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateReminder(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'title', 'description', 'type', 'due_date', 'due_time', 'priority', 'status',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('reminders').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update reminders failed: ${error.message}`)
  const paths = ['/reminders', '/']
  if (data.client_id) paths.push(`/clients/${data.client_id}`)
  await revalidate(paths)
  return { id: data.id, updated_fields: Object.keys(patch), title: data.title, status: data.status }
}

async function deleteReminder(input) {
  // Grab client_id before delete so we can revalidate their page too.
  const { data: existing } = await supabase
    .from('reminders').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('reminders').delete().eq('id', input.id)
  if (error) throw new Error(`delete reminders failed: ${error.message}`)
  const paths = ['/reminders', '/']
  if (existing?.client_id) paths.push(`/clients/${existing.client_id}`)
  await revalidate(paths)
  return { deleted: input.id }
}

// =============================================================================
// TASKS
// =============================================================================

async function addTask(input) {
  const client_id = await resolveClientIdByName(input.client_company_name)
  const assignee_id = await findOneTeamMemberIdByName(input.assignee_name)
  const contract_id = await resolveContractIdByTitle(input.contract_title)
  const row = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    status: 'todo',
    client_id,
    assignee_id,
    contract_id,
    due_date: input.due_date ?? null,
  }
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw new Error(`insert tasks failed: ${error.message}`)
  const paths = ['/tasks', '/my-tasks', '/my-dashboard', '/']
  if (client_id) paths.push(`/clients/${client_id}`)
  await revalidate(paths)
  return {
    id: data.id,
    title: data.title,
    linked_client_id: client_id,
    linked_contract_id: contract_id,
    assignee_id,
    ...(input.contract_title && !contract_id ? { warning: `no contract matched "${input.contract_title}" — task created unlinked.` } : {}),
  }
}

async function findTask(input) {
  let q = supabase
    .from('tasks')
    .select('id, title, status, priority, due_date, client_id, assignee_id')
    .ilike('title', `%${input.query}%`)
    .limit(5)
  if (input.only_open) q = q.neq('status', 'completed')
  const { data, error } = await q
  if (error) throw new Error(`tasks search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateTask(input) {
  const { id, ...rest } = input
  // Allow null for contract_id so the user can unlink. pickDefined drops null,
  // so handle it explicitly.
  const patch = pickDefined(rest, ['title', 'description', 'priority', 'status', 'due_date'])
  if ('contract_id' in rest) patch.contract_id = rest.contract_id || null
  // Reassign: empty string = unassign, name = resolve to id, otherwise leave alone.
  if ('assignee_name' in rest) {
    if (rest.assignee_name === '' || rest.assignee_name === null) {
      patch.assignee_id = null
    } else if (rest.assignee_name) {
      const aid = await findOneTeamMemberIdByName(rest.assignee_name)
      if (aid) patch.assignee_id = aid
      else return { warning: `no team member matched "${rest.assignee_name}" — task unchanged.` }
    }
  }
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('tasks').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update tasks failed: ${error.message}`)
  const paths = ['/tasks', '/my-tasks', '/my-dashboard', '/']
  if (data.client_id) paths.push(`/clients/${data.client_id}`)
  await revalidate(paths)
  return { id: data.id, updated_fields: Object.keys(patch), title: data.title, status: data.status }
}

async function deleteTask(input) {
  const { data: existing } = await supabase
    .from('tasks').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('tasks').delete().eq('id', input.id)
  if (error) throw new Error(`delete tasks failed: ${error.message}`)
  const paths = ['/tasks', '/my-tasks', '/my-dashboard', '/']
  if (existing?.client_id) paths.push(`/clients/${existing.client_id}`)
  await revalidate(paths)
  return { deleted: input.id }
}

// =============================================================================
// CONTRACTS
// =============================================================================

async function addContract(input) {
  const row = {
    client_id: input.client_id,
    title: input.title,
    contract_type: input.contract_type,
    start_date: input.start_date,
    end_date: input.end_date,
    renewal_date: input.renewal_date ?? null,
    status: input.status ?? 'unsigned',
    value: input.value ?? null,
    notes: input.notes ?? null,
    scope: input.scope ?? null,
    file_url: input.file_url ?? null,
  }
  const { data, error } = await supabase.from('contracts').insert(row).select().single()
  if (error) throw new Error(`insert contracts failed: ${error.message}`)
  await revalidate(['/contracts', `/clients/${input.client_id}`, '/'])
  return { id: data.id, title: data.title, status: data.status }
}

async function findContract(input) {
  const { data, error } = await supabase
    .from('contracts')
    .select('id, title, contract_type, status, start_date, end_date, value, client_id')
    .ilike('title', `%${input.query}%`)
    .limit(5)
  if (error) throw new Error(`contracts search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateContract(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'title', 'contract_type', 'start_date', 'end_date', 'renewal_date',
    'status', 'value', 'notes', 'scope', 'file_url',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('contracts').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update contracts failed: ${error.message}`)
  await revalidate(['/contracts', `/clients/${data.client_id}`, '/'])
  return { id: data.id, updated_fields: Object.keys(patch), title: data.title }
}

async function deleteContract(input) {
  const { data: existing } = await supabase
    .from('contracts').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('contracts').delete().eq('id', input.id)
  if (error) throw new Error(`delete contracts failed: ${error.message}`)
  const paths = ['/contracts', '/']
  if (existing?.client_id) paths.push(`/clients/${existing.client_id}`)
  await revalidate(paths)
  return { deleted: input.id }
}

// =============================================================================
// SOCIAL ACCOUNTS
// =============================================================================

// Mirrors src/app/actions/social_accounts.ts — same scheme so dashboard and
// agent stay interoperable. Note: NOT real crypto. Swap to AES-256-GCM with an
// env-var key when productionising.
function mockSecureEncrypt(text) {
  if (!text) return null
  return `enc__${Buffer.from(String(text)).toString('base64')}__secure`
}

async function clearOtherDefaults(client_id, platform) {
  await supabase
    .from('social_accounts')
    .update({ is_default: false })
    .eq('client_id', client_id)
    .eq('platform', platform)
}

async function addSocialAccount(input) {
  const isDefault = !!input.is_default
  if (isDefault) await clearOtherDefaults(input.client_id, input.platform)

  const row = {
    client_id: input.client_id,
    platform: input.platform,
    account_name: input.account_name ?? null,
    username: input.username ?? null,
    email: input.email ?? null,
    external_id: input.external_id ?? null,
    encrypted_password: mockSecureEncrypt(input.password),
    url: input.url ?? null,
    notes: input.notes ?? null,
    status: input.status ?? 'active',
    is_default: isDefault,
  }
  const { data, error } = await supabase.from('social_accounts').insert(row).select().single()
  if (error) throw new Error(`insert social_accounts failed: ${error.message}`)
  await revalidate([`/clients/${input.client_id}`])
  return {
    id: data.id,
    platform: data.platform,
    account_name: data.account_name,
    is_default: data.is_default,
  }
}

async function findSocialAccount(input) {
  let q = supabase
    .from('social_accounts')
    .select(
      'id, platform, account_name, username, email, external_id, url, status, is_default, client_id',
    )
    .eq('client_id', input.client_id)
  if (input.platform) q = q.eq('platform', input.platform)
  const { data, error } = await q
  if (error) throw new Error(`social_accounts search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateSocialAccount(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'account_name', 'username', 'email', 'external_id', 'url', 'notes', 'status',
  ])
  if (rest.password !== undefined && rest.password !== null && rest.password !== '') {
    patch.encrypted_password = mockSecureEncrypt(rest.password)
  }
  if (typeof rest.is_default === 'boolean') {
    patch.is_default = rest.is_default
  }
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }

  // If we're flipping this row to default, clear default on its peers first.
  if (patch.is_default === true) {
    const { data: existing } = await supabase
      .from('social_accounts')
      .select('client_id, platform')
      .eq('id', id)
      .maybeSingle()
    if (existing) await clearOtherDefaults(existing.client_id, existing.platform)
  }

  const { data, error } = await supabase
    .from('social_accounts').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update social_accounts failed: ${error.message}`)
  await revalidate([`/clients/${data.client_id}`])
  return { id: data.id, updated_fields: Object.keys(patch), platform: data.platform }
}

async function setDefaultSocialAccount(input) {
  const { data: target } = await supabase
    .from('social_accounts')
    .select('client_id, platform')
    .eq('id', input.id)
    .maybeSingle()
  if (!target) throw new Error(`social_accounts ${input.id} not found`)

  await clearOtherDefaults(target.client_id, target.platform)
  const { error } = await supabase
    .from('social_accounts').update({ is_default: true }).eq('id', input.id)
  if (error) throw new Error(`set default failed: ${error.message}`)
  await revalidate([`/clients/${target.client_id}`])
  return { id: input.id, is_default: true }
}

async function deleteSocialAccount(input) {
  const { data: existing } = await supabase
    .from('social_accounts').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('social_accounts').delete().eq('id', input.id)
  if (error) throw new Error(`delete social_accounts failed: ${error.message}`)
  if (existing?.client_id) await revalidate([`/clients/${existing.client_id}`])
  return { deleted: input.id }
}

// =============================================================================
// AD CAMPAIGNS
// =============================================================================

async function addCampaign(input) {
  const row = {
    client_id: input.client_id,
    name: input.name,
    budget: input.budget ?? null,
    objective: input.objective ?? null,
    start_date: input.start_date ?? null,
    end_date: input.end_date ?? null,
    status: input.status ?? 'planned',
    account_link: input.account_link ?? null,
    notes: input.notes ?? null,
  }
  const { data, error } = await supabase.from('ad_campaigns').insert(row).select().single()
  if (error) throw new Error(`insert ad_campaigns failed: ${error.message}`)
  await revalidate(['/campaigns', `/clients/${input.client_id}`, '/'])
  return { id: data.id, name: data.name, status: data.status }
}

async function findCampaign(input) {
  const { data, error } = await supabase
    .from('ad_campaigns')
    .select('id, name, status, budget, objective, client_id, start_date, end_date')
    .ilike('name', `%${input.query}%`)
    .limit(5)
  if (error) throw new Error(`ad_campaigns search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateCampaign(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'name', 'budget', 'objective', 'start_date', 'end_date',
    'status', 'account_link', 'notes', 'performance_summary',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('ad_campaigns').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update ad_campaigns failed: ${error.message}`)
  await revalidate(['/campaigns', `/clients/${data.client_id}`, '/'])
  return { id: data.id, updated_fields: Object.keys(patch), name: data.name }
}

async function deleteCampaign(input) {
  const { data: existing } = await supabase
    .from('ad_campaigns').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('ad_campaigns').delete().eq('id', input.id)
  if (error) throw new Error(`delete ad_campaigns failed: ${error.message}`)
  const paths = ['/campaigns', '/']
  if (existing?.client_id) paths.push(`/clients/${existing.client_id}`)
  await revalidate(paths)
  return { deleted: input.id }
}

// =============================================================================
// TEAM MEMBERS
// =============================================================================

async function addTeamMember(input) {
  const row = {
    full_name: input.full_name,
    role: input.role ?? 'staff',
    job_title: input.job_title ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    status: input.status ?? 'active',
    notes: input.notes ?? null,
    salary: input.salary ?? null,
    salary_currency: input.salary_currency ?? 'SAR',
  }
  const { data, error } = await supabase.from('team_members').insert(row).select().single()
  if (error) throw new Error(`insert team_members failed: ${error.message}`)
  await revalidate(['/team', '/'])
  return { id: data.id, full_name: data.full_name, role: data.role }
}

async function findTeamMember(input) {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, full_name, role, job_title, email, status')
    .or(`full_name.ilike.%${input.query}%,email.ilike.%${input.query}%`)
    .limit(5)
  if (error) throw new Error(`team_members search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateTeamMember(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'full_name', 'role', 'job_title', 'email', 'phone', 'whatsapp', 'status', 'notes',
    'salary', 'salary_currency',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('team_members').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update team_members failed: ${error.message}`)
  await revalidate(['/team', '/'])
  return { id: data.id, updated_fields: Object.keys(patch), full_name: data.full_name }
}

async function deleteTeamMember(input) {
  const { error } = await supabase.from('team_members').delete().eq('id', input.id)
  if (error) throw new Error(`delete team_members failed: ${error.message}`)
  await revalidate(['/team', '/'])
  return { deleted: input.id }
}

// =============================================================================
// COMMUNICATION LOGS
// =============================================================================

async function logCommunication(input) {
  const row = {
    client_id: input.client_id,
    type: input.type,
    summary: input.summary,
    notes: input.notes ?? null,
    date: input.date ?? new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('communication_logs').insert(row).select().single()
  if (error) throw new Error(`insert communication_logs failed: ${error.message}`)
  await revalidate([`/clients/${input.client_id}`])
  return { id: data.id, type: data.type, summary: data.summary }
}

// =============================================================================
// OUTBOUND WHATSAPP / EMAIL — reach out to a contact directly
// =============================================================================

// Stamp last_contacted_at on the client, bump to_contact → lead so the
// "not contacted yet" pill flips, and write a paper-trail row to
// communication_logs. Best-effort: any one of these failing should not
// surface as the outbound send failing — log and continue.
async function markClientContacted(clientId, channel, summary) {
  if (!clientId) return
  try {
    const { data: existing } = await supabase
      .from('clients')
      .select('status')
      .eq('id', clientId)
      .maybeSingle()
    const patch = { last_contacted_at: new Date().toISOString() }
    if (existing?.status === 'to_contact') patch.status = 'lead'
    await supabase.from('clients').update(patch).eq('id', clientId)
  } catch (err) {
    console.error('[mark-contacted] client update failed:', err?.message ?? err)
  }
  try {
    await supabase.from('communication_logs').insert({
      client_id: clientId,
      type: channel,
      summary: summary.slice(0, 200),
      date: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[mark-contacted] comm log insert failed:', err?.message ?? err)
  }
  try {
    await revalidate(['/clients', `/clients/${clientId}`, '/'])
  } catch {}
}

async function sendWhatsappMessage(input) {
  if (!isReady()) throw new Error('WhatsApp socket is not ready yet')
  const jid = phoneToJid(input.to_phone)
  if (!jid) throw new Error(`invalid phone number: "${input.to_phone}"`)
  const text = String(input.text ?? '').trim()
  if (!text) throw new Error('text is required')

  const { sock } = getSock()
  try {
    await sock.sendMessage(jid, { text })
  } catch (err) {
    throw new Error(`send failed: ${err?.message ?? err}`)
  }
  await markClientContacted(input.client_id, 'whatsapp', `WhatsApp: ${text}`)
  console.log(`[outbound] sent to ${jid}: ${text.slice(0, 80)}`)
  return {
    sent: true,
    to: jid,
    preview: text.slice(0, 80),
    client_marked_contacted: !!input.client_id,
  }
}

// Resend (https://resend.com) — single fetch, no SDK. Falls back to a
// log-only behaviour if RESEND_API_KEY isn't set so the agent doesn't
// hard-fail in environments where email isn't configured yet.
//
// FROM resolution: tries the configured RESEND_FROM (e.g. the agency's
// own info@domain). If Resend rejects with 403 because that domain
// isn't verified yet, automatically retries from
// RESEND_FALLBACK_FROM (defaults to onboarding@resend.dev, which is
// always valid). That way emails keep going through during the
// DNS-verification window — once the domain is verified, the same code
// silently starts using the branded sender.
async function postEmailToResend(apiKey, body) {
  return fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  })
}

// =============================================================================
// Email signature — appended to every outbound email so the recipient
// always sees the Emergize brand block (logo + socials + contact) and
// understands the message came from the AI agent. Logo lives in the
// public agency-files bucket (uploaded once, stable URL forever).
// =============================================================================

const EMAIL_SIGNATURE = {
  logoUrl:
    process.env.EMAIL_LOGO_URL ||
    'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/emergize-logo.png',
  instagramIcon:
    'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/instagram-icon-v3.png',
  tiktokIcon:
    'https://ddiaetxjjsobwkrapxnt.supabase.co/storage/v1/object/public/agency-files/brand/tiktok-icon.png',
  websiteUrl: process.env.EMAIL_WEBSITE_URL || 'https://emergize-sa.com',
  instagramUrl: 'https://www.instagram.com/emergize_sa',
  tiktokUrl: 'https://www.tiktok.com/@emergize1',
  contactEmail: 'info@emergize-sa.com',
  contactPhone: '+966 57 760 2467',
  contactPhoneIntl: '+966577602467', // for tel: links
  tagline: 'Emerge to Dominate',
}

function buildSignatureHtml(bodyText) {
  // The signature block uses inline styles (Gmail/Outlook strip <style>
  // tags). Logo is set to a fixed width so it stays sane across mail
  // clients. Social links are text-with-icons rather than full Instagram
  // embeds so Outlook doesn't choke on them.
  const escape = (s) => String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]))
  const bodyHtml = escape(bodyText).replace(/\n/g, '<br>')

  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;color:#1a1a1a;line-height:1.55;">
<div style="max-width:600px;margin:0 auto;padding:24px;">
  <div style="font-size:14.5px;color:#1a1a1a;">${bodyHtml}</div>

  <div style="margin-top:32px;padding-top:20px;border-top:2px solid #9DCD3D;">
    <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
      <tr>
        <td style="padding-right:18px;vertical-align:middle;">
          <img src="${EMAIL_SIGNATURE.logoUrl}" alt="Emergize" width="120" style="display:block;width:120px;height:auto;border:0;" />
        </td>
        <td style="vertical-align:middle;font-family:Inter,Segoe UI,Arial,sans-serif;">
          <div style="font-weight:700;font-size:13px;color:#0a0a0a;letter-spacing:0.5px;text-transform:uppercase;">EMERGIZE</div>
          <div style="font-size:11.5px;color:#9DCD3D;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-top:2px;">${EMAIL_SIGNATURE.tagline}</div>
          <div style="margin-top:8px;font-size:12.5px;color:#444;line-height:1.7;">
            <a href="tel:${EMAIL_SIGNATURE.contactPhoneIntl}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.contactPhone}</a><br>
            <a href="mailto:${EMAIL_SIGNATURE.contactEmail}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.contactEmail}</a><br>
            <a href="${EMAIL_SIGNATURE.websiteUrl}" style="color:#444;text-decoration:none;">${EMAIL_SIGNATURE.websiteUrl.replace(/^https?:\/\//, '')}</a>
          </div>
          <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:10px;">
            <tr>
              <td style="padding-right:10px;">
                <a href="${EMAIL_SIGNATURE.instagramUrl}" style="text-decoration:none;display:inline-block;">
                  <img src="${EMAIL_SIGNATURE.instagramIcon}" alt="Instagram" width="28" height="28" style="display:block;width:28px;height:28px;border:0;" />
                </a>
              </td>
              <td>
                <a href="${EMAIL_SIGNATURE.tiktokUrl}" style="text-decoration:none;display:inline-block;">
                  <img src="${EMAIL_SIGNATURE.tiktokIcon}" alt="TikTok" width="28" height="28" style="display:block;width:28px;height:28px;border:0;" />
                </a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <div style="margin-top:14px;font-size:10.5px;color:#888;font-style:italic;">
      Sent on behalf of Emergize by the AI assistant. Reply to this email and a team member will follow up.
    </div>
  </div>
</div>
</body></html>`
}

function buildSignaturePlainText(bodyText) {
  return [
    bodyText,
    '',
    '—',
    'EMERGIZE · Emerge to Dominate',
    EMAIL_SIGNATURE.contactPhone,
    `${EMAIL_SIGNATURE.contactEmail}  ·  ${EMAIL_SIGNATURE.websiteUrl.replace(/^https?:\/\//, '')}`,
    `Instagram: ${EMAIL_SIGNATURE.instagramUrl}`,
    `TikTok:    ${EMAIL_SIGNATURE.tiktokUrl}`,
    '',
    '(Sent on behalf of Emergize by the AI assistant. Reply and a team member will follow up.)',
  ].join('\n')
}

// Resolve { url | file_id, filename? } → { filename, content (base64) }.
// Used by sendEmail and send_whatsapp_file_url to share the same fetch /
// client_files-resolution code path.
async function resolveAttachment(att, maxBytes) {
  let url = att.url
  let filename = att.filename
  if (!url && att.file_id) {
    const { data: row, error } = await supabase
      .from('client_files').select('name, file_path, file_type').eq('id', att.file_id).maybeSingle()
    if (error || !row) throw new Error(`attachment file_id ${att.file_id} not found`)
    url = row.file_path
    filename = filename || row.name
  }
  if (!url) throw new Error('attachment needs url or file_id')
  if (!filename) {
    // Last segment of the URL path, stripped of query string
    try {
      const u = new URL(url)
      filename = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'attachment')
    } catch { filename = 'attachment' }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(`attachment fetch failed (${res.status}): ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > maxBytes) {
    throw new Error(`attachment "${filename}" too large (${buf.length} bytes, limit ${maxBytes})`)
  }
  return { filename, content: buf.toString('base64'), bytes: buf.length }
}

async function sendEmail(input) {
  const to = String(input.to ?? '').trim()
  const subject = String(input.subject ?? '').trim()
  const text = String(input.text ?? '').trim()
  if (!to || !to.includes('@')) throw new Error(`invalid recipient: "${input.to}"`)
  if (!subject) throw new Error('subject is required')
  if (!text) throw new Error('text is required')

  const apiKey = process.env.RESEND_API_KEY
  // Sender name says "Emergize Agent" so the recipient sees it's an
  // automated message, not a human at Emergize. The footer of the
  // signature reinforces this in plain text.
  const primaryFrom = process.env.RESEND_FROM ?? 'Emergize Agent <info@emergize-sa.com>'
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM ?? 'Emergize Agent <onboarding@resend.dev>'

  if (!apiKey) {
    console.warn('[email] RESEND_API_KEY not set — printing instead of sending:')
    console.warn(`[email] To: ${to}\n  Subject: ${subject}\n  Body:\n${text}`)
    return {
      sent: false,
      warning: 'RESEND_API_KEY not configured; email was logged to the agent console only. Set RESEND_API_KEY in whatsapp-agent/.env to actually send.',
    }
  }

  // Resolve attachments. Capped at 5 files / 20MB total — Resend's own
  // limit is 40MB but we leave headroom for the base64 expansion.
  const attachInputs = Array.isArray(input.attachments) ? input.attachments.slice(0, 5) : []
  const attachments = []
  let totalBytes = 0
  for (const a of attachInputs) {
    const resolved = await resolveAttachment(a, 20 * 1024 * 1024)
    totalBytes += resolved.bytes
    if (totalBytes > 20 * 1024 * 1024) {
      throw new Error('total attachment size exceeds 20MB cap')
    }
    attachments.push({ filename: resolved.filename, content: resolved.content })
  }

  // Wrap the user-supplied body in the branded signature. We send BOTH
  // html (rich block with logo + social links) AND text (plaintext
  // fallback for old clients / spam filters). Resend prefers html when
  // both are present.
  const html = buildSignatureHtml(text)
  const textWithSig = buildSignaturePlainText(text)

  const bodyShared = { from: primaryFrom, to: [to], subject, html, text: textWithSig }
  if (attachments.length) bodyShared.attachments = attachments

  let res = await postEmailToResend(apiKey, bodyShared)
  let fromUsed = primaryFrom
  let domainFallback = false

  // Auto-fallback when the primary sender's domain isn't verified yet.
  // Resend returns 403 with name='validation_error' and "domain is not
  // verified" in the message; we cover both that wording and 422.
  if (!res.ok && primaryFrom !== fallbackFrom) {
    const status = res.status
    const peek = await res.clone().text()
    const looksLikeDomainErr =
      (status === 403 || status === 422) &&
      /domain (is )?not verified|verify your domain/i.test(peek)
    if (looksLikeDomainErr) {
      console.warn(`[email] primary sender "${primaryFrom}" not verified — retrying via fallback "${fallbackFrom}"`)
      res = await postEmailToResend(apiKey, { ...bodyShared, from: fallbackFrom })
      fromUsed = fallbackFrom
      domainFallback = true
    }
  }

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`)
  }

  const attachSummary = attachments.length
    ? ` (+${attachments.length} attachment${attachments.length === 1 ? '' : 's'})`
    : ''
  await markClientContacted(input.client_id, 'email', `Email "${subject}"${attachSummary}: ${text}`)
  console.log(`[outbound] emailed ${to}: ${subject}${attachSummary} (from=${fromUsed}${domainFallback ? ' [fallback]' : ''})`)
  return {
    sent: true,
    to,
    subject,
    from: fromUsed,
    attachments_sent: attachments.length,
    client_marked_contacted: !!input.client_id,
    ...(domainFallback
      ? {
          warning:
            `Sent from ${fromUsed} because the primary domain on ${primaryFrom} isn't verified in Resend yet. ` +
            `Add the domain at https://resend.com/domains and the next email will use the branded sender automatically.`,
        }
      : {}),
  }
}

// Map a file extension to a sensible MIME type. Falls back to
// application/octet-stream so baileys still accepts the document.
function mimeFromExt(ext) {
  const e = String(ext || '').toLowerCase().replace(/^\./, '')
  const m = {
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv',
    txt: 'text/plain',
    zip: 'application/zip',
  }
  return m[e] || 'application/octet-stream'
}

// Send a file from client_files (the Files page on the dashboard) as a
// WhatsApp document attachment. The user's classic use case is:
//   "send the Emergize profile pdf to +966555..." — agent finds the
//   profile in /files, downloads it, ships it. By default, the file
//   search runs across ALL clients so agency-wide assets like the
//   company profile can be found without knowing which client they're
//   attached to.
// Send any public URL as a WhatsApp document — sibling to sendWhatsappFile
// but doesn't require the file to live in client_files first. Used for
// forwarding an inbound PDF the user just sent, shipping an external link,
// etc. If the URL is gated, the agent should download it first via fetch
// inside run_code and then pass a Supabase-Storage public URL.
async function sendWhatsappFileUrl(input) {
  if (!isReady()) throw new Error('WhatsApp socket is not ready yet')
  const jid = phoneToJid(input.to_phone)
  if (!jid) throw new Error(`invalid phone number: "${input.to_phone}"`)
  if (!input.url) throw new Error('url is required')

  const resp = await fetch(input.url)
  if (!resp.ok) throw new Error(`fetch ${input.url} → HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length > 64 * 1024 * 1024) {
    throw new Error(`file too large for WhatsApp (${buf.length} bytes, cap 64MB)`)
  }

  // Filename / mime: prefer explicit inputs, fall back to URL inference.
  let filename = input.filename
  if (!filename) {
    try {
      const u = new URL(input.url)
      filename = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || 'file')
    } catch { filename = 'file' }
  }
  const ext = (filename.split('.').pop() || '').toLowerCase()
  const mime = input.mime || resp.headers.get('content-type')?.split(';')[0] || mimeFromExt(ext)

  const sock = getSock()
  await sock.sendMessage(jid, {
    document: buf,
    mimetype: mime,
    fileName: filename,
    caption: input.caption || undefined,
  })

  await markClientContacted(input.client_id, 'whatsapp', `Sent file "${filename}" (${(buf.length / 1024).toFixed(1)} KB) via WhatsApp`)
  console.log(`[outbound] WA file ${filename} → ${jid} (${buf.length} bytes from ${input.url})`)
  return {
    sent: true,
    to: jid,
    filename,
    mime,
    bytes: buf.length,
    client_marked_contacted: !!input.client_id,
  }
}

// Fetch a PDF and extract text. Mostly for re-reading inbound PDFs where
// the inline 8000-char preview wasn't enough, or for following a PDF link
// the user pasted in a follow-up turn.
async function readPdf(input) {
  if (!input.url) throw new Error('url is required')
  const max = Math.max(1, Math.min(60000, input.max_chars ?? 24000))

  const { extractText: pdfExtractText, getDocumentProxy } = await import('unpdf')
  const resp = await fetch(input.url)
  if (!resp.ok) throw new Error(`fetch ${input.url} → HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length > 32 * 1024 * 1024) {
    throw new Error(`PDF too large (${buf.length} bytes, cap 32MB)`)
  }

  const pdf = await getDocumentProxy(new Uint8Array(buf))
  const numPages = pdf.numPages ?? null
  const result = await pdfExtractText(pdf, { mergePages: true })
  const fullText = String(result.text || '').trim()
  const truncated = fullText.length > max
  return {
    text: truncated ? fullText.slice(0, max) : fullText,
    pages: numPages,
    total_chars: fullText.length,
    truncated,
  }
}

async function sendWhatsappFile(input) {
  if (!isReady()) throw new Error('WhatsApp socket is not ready yet')
  const jid = phoneToJid(input.to_phone)
  if (!jid) throw new Error(`invalid phone number: "${input.to_phone}"`)

  // 1. Resolve the file row.
  let file = null
  if (input.file_id) {
    const { data, error } = await supabase
      .from('client_files')
      .select('id, name, file_path, file_type, file_size, client_id')
      .eq('id', input.file_id)
      .maybeSingle()
    if (error) throw new Error(`file lookup failed: ${error.message}`)
    if (!data) throw new Error(`file ${input.file_id} not found`)
    file = data
  } else if (input.query) {
    let q = supabase
      .from('client_files')
      .select('id, name, file_path, file_type, file_size, client_id, clients(company_name)')
      .ilike('name', `%${input.query}%`)
      .order('created_at', { ascending: false })
      .limit(5)
    if (input.client_company_name) {
      const clientId = await resolveClientIdByName(input.client_company_name)
      if (clientId) q = supabase
        .from('client_files')
        .select('id, name, file_path, file_type, file_size, client_id, clients(company_name)')
        .eq('client_id', clientId)
        .ilike('name', `%${input.query}%`)
        .order('created_at', { ascending: false })
        .limit(5)
    }
    const { data, error } = await q
    if (error) throw new Error(`file search failed: ${error.message}`)
    if (!data || data.length === 0) {
      throw new Error(`no file matches "${input.query}" — upload it on /files first, or ask for a different name.`)
    }
    if (data.length > 1) {
      // Multiple matches — surface them all so the model can disambiguate
      // by passing file_id on the next call rather than guessing.
      const list = data.map((d) => `${d.id}: ${d.name} (${d.clients?.company_name || 'unlinked'})`).join('\n  ')
      throw new Error(`${data.length} files match "${input.query}":\n  ${list}\nPick one by passing file_id.`)
    }
    file = data[0]
  } else {
    throw new Error('Provide either file_id or query.')
  }

  // 2. Download the bytes from Supabase Storage. file_path is the public URL.
  const fileUrl = file.file_path
  if (!fileUrl) throw new Error(`file ${file.id} has no file_path — re-upload it.`)
  const res = await fetch(fileUrl)
  if (!res.ok) throw new Error(`download failed: ${res.status} ${res.statusText}`)
  const buf = Buffer.from(await res.arrayBuffer())

  // 3. Send as a document. fileName falls back to the row's stored name
  // and the mimetype is inferred from file_type (which the upload flow
  // sets to the file extension).
  const fileName = file.name || `file.${file.file_type || 'bin'}`
  const mimetype = mimeFromExt(file.file_type)
  const { sock } = getSock()
  try {
    await sock.sendMessage(jid, {
      document: buf,
      mimetype,
      fileName,
      caption: input.caption || undefined,
    })
  } catch (err) {
    throw new Error(`send failed: ${err?.message ?? err}`)
  }

  // 4. If this was an outreach to an existing client (e.g. business card →
  // add_client → send-profile), mark them contacted just like
  // send_whatsapp_message does.
  await markClientContacted(input.client_id, 'whatsapp', `Sent file: ${fileName}${input.caption ? ` — ${input.caption}` : ''}`)
  console.log(`[outbound-file] sent ${fileName} (${buf.length}B) to ${jid}`)
  return {
    sent: true,
    to: jid,
    file_id: file.id,
    fileName,
    bytes: buf.length,
    client_marked_contacted: !!input.client_id,
  }
}

// =============================================================================
// CLIENT SERVICES
// =============================================================================

async function addClientService(input) {
  const { data, error } = await supabase
    .from('client_services')
    .insert({ client_id: input.client_id, service_name: input.service_name })
    .select()
    .single()
  if (error) throw new Error(`insert client_services failed: ${error.message}`)
  await revalidate([`/clients/${input.client_id}`])
  return { id: data.id, service_name: data.service_name }
}

async function removeClientService(input) {
  const { data: existing } = await supabase
    .from('client_services').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('client_services').delete().eq('id', input.id)
  if (error) throw new Error(`delete client_services failed: ${error.message}`)
  if (existing?.client_id) await revalidate([`/clients/${existing.client_id}`])
  return { deleted: input.id }
}

async function listClientServices(input) {
  const { data, error } = await supabase
    .from('client_services')
    .select('id, service_name')
    .eq('client_id', input.client_id)
  if (error) throw new Error(`list client_services failed: ${error.message}`)
  return { services: data ?? [] }
}

// =============================================================================
// QUOTATIONS
// =============================================================================

// URL the agent shares with the user after creating a quote so they can open
// and print it. Falls back to the current public dashboard if unset.
const DASHBOARD_URL =
  process.env.DASHBOARD_URL ?? 'https://darkturquoise-mantis-641083.hostingersite.com'

async function nextQuoteNumber() {
  const year = new Date().getFullYear()
  const prefix = `Q-${year}-`
  const { data, error } = await supabase
    .from('quotations')
    .select('quote_number')
    .like('quote_number', `${prefix}%`)
    .order('quote_number', { ascending: false })
    .limit(1)
  if (error) throw new Error(`quote_number lookup failed: ${error.message}`)
  const last = data?.[0]?.quote_number
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

async function createQuotation(input) {
  const quote_number = await nextQuoteNumber()

  // Resolve linked CRM client if the user referenced one by name.
  let client_id = null
  let warnings = []
  if (input.client_company_name) {
    client_id = await resolveClientIdByName(input.client_company_name)
    if (!client_id) {
      warnings.push(`no CRM client matched "${input.client_company_name}" — quote saved unlinked.`)
    }
  }

  const today = new Date()
  const defaultValidUntil = new Date(today)
  defaultValidUntil.setDate(defaultValidUntil.getDate() + 30)

  const row = {
    quote_number,
    client_id,
    client_name_en: input.client_name_en ?? null,
    client_name_ar: input.client_name_ar ?? null,
    client_company: input.client_company ?? null,
    client_vat: input.client_vat ?? null,
    client_cr: input.client_cr ?? null,
    issue_date: input.issue_date ?? today.toISOString().split('T')[0],
    valid_until: input.valid_until ?? defaultValidUntil.toISOString().split('T')[0],
    vat_rate: input.vat_rate ?? 15,
    term1_pct: input.term1_pct ?? '50%',
    term1_desc: input.term1_desc ?? 'After signing the contract',
    term2_pct: input.term2_pct ?? '50%',
    term2_desc:
      input.term2_desc ?? 'After the service period is finished and delivered as agreed',
    notes: input.notes ?? null,
  }

  const { data, error } = await supabase.from('quotations').insert(row).select().single()
  if (error) throw new Error(`insert quotation failed: ${error.message}`)

  await revalidate(['/quotations', '/'])
  return {
    id: data.id,
    quote_number: data.quote_number,
    url: `${DASHBOARD_URL}/quotations/${data.id}`,
    linked_client_id: client_id,
    ...(warnings.length ? { warning: warnings.join(' ') } : {}),
  }
}

async function addQuotationItem(input) {
  // Pick a position just after the current max for this quote.
  const { data: existing } = await supabase
    .from('quotation_items')
    .select('position')
    .eq('quotation_id', input.quotation_id)
    .order('position', { ascending: false })
    .limit(1)
  const nextPosition = (existing?.[0]?.position ?? -1) + 1

  const row = {
    quotation_id: input.quotation_id,
    name: input.name,
    description: input.description ?? null,
    pricing_mode: input.pricing_mode ?? 'fixed',
    qty: input.qty ?? 1,
    unit_price: input.unit_price ?? 0,
    percentage: input.percentage ?? null,
    position: nextPosition,
  }
  const { data, error } = await supabase.from('quotation_items').insert(row).select().single()
  if (error) throw new Error(`insert quotation_items failed: ${error.message}`)

  await revalidate(['/quotations', `/quotations/${input.quotation_id}`])
  return { id: data.id, name: data.name, position: data.position }
}

async function findQuotation(input) {
  const { data, error } = await supabase
    .from('quotations')
    .select('id, quote_number, client_name_en, client_name_ar, client_company, status, issue_date')
    .or(
      `quote_number.ilike.%${input.query}%,client_name_en.ilike.%${input.query}%,client_name_ar.ilike.%${input.query}%,client_company.ilike.%${input.query}%`,
    )
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(`quotations search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateQuotation(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'client_name_en', 'client_name_ar', 'client_company', 'client_vat', 'client_cr',
    'issue_date', 'valid_until', 'vat_rate',
    'term1_pct', 'term1_desc', 'term2_pct', 'term2_desc',
    'notes',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('quotations').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update quotation failed: ${error.message}`)
  await revalidate(['/quotations', `/quotations/${id}`])
  return {
    id: data.id,
    quote_number: data.quote_number,
    updated_fields: Object.keys(patch),
  }
}

async function setQuotationStatus(input) {
  const { data, error } = await supabase
    .from('quotations').update({ status: input.status }).eq('id', input.id).select().single()
  if (error) throw new Error(`set status failed: ${error.message}`)
  await revalidate(['/quotations', `/quotations/${input.id}`])
  return { id: data.id, quote_number: data.quote_number, status: data.status }
}

async function removeQuotationItem(input) {
  const { data: existing } = await supabase
    .from('quotation_items').select('quotation_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('quotation_items').delete().eq('id', input.id)
  if (error) throw new Error(`delete quotation item failed: ${error.message}`)
  if (existing?.quotation_id) {
    await revalidate(['/quotations', `/quotations/${existing.quotation_id}`])
  }
  return { deleted: input.id }
}

async function deleteQuotationExec(input) {
  const { error } = await supabase.from('quotations').delete().eq('id', input.id)
  if (error) throw new Error(`delete quotation failed: ${error.message}`)
  await revalidate(['/quotations', '/'])
  return { deleted: input.id }
}

async function sendQuotationPdf(input) {
  if (!isReady()) throw new Error('WhatsApp socket not ready')

  // Load the quote + items from Supabase.
  const [{ data: q, error: qe }, { data: items, error: ie }] = await Promise.all([
    supabase.from('quotations').select('*').eq('id', input.id).maybeSingle(),
    supabase
      .from('quotation_items')
      .select('*')
      .eq('quotation_id', input.id)
      .order('position', { ascending: true }),
  ])
  if (qe) throw new Error(`fetch quotation failed: ${qe.message}`)
  if (ie) throw new Error(`fetch quotation items failed: ${ie.message}`)
  if (!q) throw new Error(`quotation ${input.id} not found`)

  const pdf = await generateQuotationPdf(q, items ?? [])
  const { sock, userJid } = getSock()

  const fileName = `${q.quote_number}.pdf`
  await sock.sendMessage(userJid, {
    document: pdf,
    mimetype: 'application/pdf',
    fileName,
    caption: `${q.quote_number} — ${q.client_name_en || q.client_name_ar || 'quote'}`,
  })

  return {
    sent: true,
    quote_number: q.quote_number,
    bytes: pdf.length,
    fileName,
  }
}

// =============================================================================
// LONG-TERM MEMORY
// =============================================================================

async function doRememberFact(input) {
  const entry = await rememberFact(input.text)
  return { saved: entry.id, text: entry.text }
}

async function doForgetFact(input) {
  return await forgetFact(input.id)
}

// =============================================================================
// CONTRACT PAYMENTS + TASK→CONTRACT LINK
// =============================================================================

async function addContractPayment(input) {
  const row = {
    contract_id: input.contract_id,
    amount: input.amount,
    due_date: input.due_date,
    paid_date: input.paid_date ?? null,
    status: input.status ?? (input.paid_date ? 'paid' : 'pending'),
    method: input.method ?? null,
    notes: input.notes ?? null,
  }
  const { data, error } = await supabase
    .from('contract_payments').insert(row).select().single()
  if (error) throw new Error(`insert contract_payments failed: ${error.message}`)
  const clientId = await getClientIdForContract(input.contract_id)
  if (clientId) await revalidate([`/clients/${clientId}`])
  return { id: data.id, amount: data.amount, due_date: data.due_date, status: data.status }
}

async function markPaymentPaid(input) {
  const paid_date = input.paid_date ?? new Date().toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('contract_payments')
    .update({ status: 'paid', paid_date })
    .eq('id', input.id)
    .select()
    .single()
  if (error) throw new Error(`mark paid failed: ${error.message}`)
  const clientId = await getClientIdForContract(data.contract_id)
  if (clientId) await revalidate([`/clients/${clientId}`])
  return { id: data.id, status: data.status, paid_date: data.paid_date }
}

async function updateContractPayment(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, ['amount', 'due_date', 'paid_date', 'status', 'method', 'notes'])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('contract_payments').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update contract_payments failed: ${error.message}`)
  const clientId = await getClientIdForContract(data.contract_id)
  if (clientId) await revalidate([`/clients/${clientId}`])
  return { id: data.id, updated_fields: Object.keys(patch) }
}

async function findContractPayments(input) {
  const { data, error } = await supabase
    .from('contract_payments')
    .select('id, amount, due_date, paid_date, status, method, notes')
    .eq('contract_id', input.contract_id)
    .order('due_date', { ascending: true })
  if (error) throw new Error(`fetch contract_payments failed: ${error.message}`)
  return { payments: data ?? [] }
}

async function deleteContractPayment(input) {
  const { data: existing } = await supabase
    .from('contract_payments').select('contract_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('contract_payments').delete().eq('id', input.id)
  if (error) throw new Error(`delete contract_payments failed: ${error.message}`)
  if (existing?.contract_id) {
    const clientId = await getClientIdForContract(existing.contract_id)
    if (clientId) await revalidate([`/clients/${clientId}`])
  }
  return { deleted: input.id }
}

async function linkTaskToContract(input) {
  const contract_id = input.contract_id || null
  const { data, error } = await supabase
    .from('tasks')
    .update({ contract_id })
    .eq('id', input.task_id)
    .select()
    .single()
  if (error) throw new Error(`link task→contract failed: ${error.message}`)
  if (data.client_id) await revalidate([`/clients/${data.client_id}`])
  return { id: data.id, contract_id: data.contract_id }
}

// =============================================================================
// NOTIFICATIONS
// =============================================================================

async function findNotifications(input) {
  let q = supabase
    .from('notifications')
    .select('id, title, message, type, related_id, is_read, created_at')
    .order('created_at', { ascending: false })
    .limit(input?.limit ?? 20)
  if (input?.only_unread) q = q.eq('is_read', false)
  const { data, error } = await q
  if (error) throw new Error(`fetch notifications failed: ${error.message}`)
  return { notifications: data ?? [] }
}

async function markNotificationRead(input) {
  const { data, error } = await supabase
    .from('notifications').update({ is_read: true }).eq('id', input.id).select().single()
  if (error) throw new Error(`mark notification read failed: ${error.message}`)
  await revalidate(['/notifications', '/'])
  return { id: data.id, is_read: true }
}

async function markAllNotificationsRead() {
  const { error } = await supabase
    .from('notifications').update({ is_read: true }).eq('is_read', false)
  if (error) throw new Error(`mark all read failed: ${error.message}`)
  await revalidate(['/notifications', '/'])
  return { ok: true }
}

async function deleteNotification(input) {
  const { error } = await supabase.from('notifications').delete().eq('id', input.id)
  if (error) throw new Error(`delete notification failed: ${error.message}`)
  await revalidate(['/notifications', '/'])
  return { deleted: input.id }
}

// =============================================================================
// CONTENT ITEMS
// =============================================================================

async function addContentItem(input) {
  const client_id = input.client_id
    ?? (await resolveClientIdByName(input.client_company_name))
  const assignee_id = await findOneTeamMemberIdByName(input.assignee_name)
  const row = {
    client_id,
    platform: input.platform ?? null,
    content_type: input.content_type ?? null,
    title: input.title,
    caption: input.caption ?? null,
    media_url: input.media_url ?? null,
    publish_date: input.publish_date ?? null,
    publish_time: input.publish_time ?? null,
    schedule_status: input.schedule_status ?? 'idea',
    campaign_name: input.campaign_name ?? null,
    assignee_id,
    notes: input.notes ?? null,
  }
  const { data, error } = await supabase.from('content_items').insert(row).select().single()
  if (error) throw new Error(`insert content_items failed: ${error.message}`)
  const paths = ['/']
  if (client_id) paths.push(`/clients/${client_id}`)
  await revalidate(paths)
  return { id: data.id, title: data.title, schedule_status: data.schedule_status }
}

async function findContentItem(input) {
  let q = supabase
    .from('content_items')
    .select('id, title, platform, content_type, schedule_status, publish_date, client_id')
    .ilike('title', `%${input.query}%`)
    .limit(5)
  if (input.schedule_status) q = q.eq('schedule_status', input.schedule_status)
  const { data, error } = await q
  if (error) throw new Error(`content_items search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateContentItem(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'title', 'caption', 'media_url', 'publish_date', 'publish_time',
    'schedule_status', 'task_status', 'campaign_name', 'notes',
  ])
  if ('assignee_name' in rest) {
    if (rest.assignee_name === '' || rest.assignee_name === null) {
      patch.assignee_id = null
    } else if (rest.assignee_name) {
      const aid = await findOneTeamMemberIdByName(rest.assignee_name)
      if (aid) patch.assignee_id = aid
      else return { warning: `no team member matched "${rest.assignee_name}" — content item unchanged.` }
    }
  }
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('content_items').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update content_items failed: ${error.message}`)
  if (data.client_id) await revalidate([`/clients/${data.client_id}`])
  return { id: data.id, updated_fields: Object.keys(patch), schedule_status: data.schedule_status }
}

async function deleteContentItem(input) {
  const { data: existing } = await supabase
    .from('content_items').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('content_items').delete().eq('id', input.id)
  if (error) throw new Error(`delete content_items failed: ${error.message}`)
  if (existing?.client_id) await revalidate([`/clients/${existing.client_id}`])
  return { deleted: input.id }
}

// =============================================================================
// CLIENT FILES (URL-only — physical uploads handled by the dashboard UI)
// =============================================================================

async function listClientFiles(input) {
  const { data, error } = await supabase
    .from('client_files')
    .select('id, name, category, file_path, file_size, file_type, created_at')
    .eq('client_id', input.client_id)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`list client_files failed: ${error.message}`)
  return { files: data ?? [] }
}

async function addClientFileLink(input) {
  const row = {
    client_id: input.client_id,
    name: input.name,
    category: input.category ?? 'other',
    file_path: input.file_path,
    file_type: input.file_type ?? null,
    file_size: null,
  }
  const { data, error } = await supabase.from('client_files').insert(row).select().single()
  if (error) throw new Error(`insert client_files failed: ${error.message}`)
  await revalidate([`/clients/${input.client_id}`])
  return { id: data.id, name: data.name }
}

async function deleteClientFile(input) {
  const { data: existing } = await supabase
    .from('client_files').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('client_files').delete().eq('id', input.id)
  if (error) throw new Error(`delete client_files failed: ${error.message}`)
  if (existing?.client_id) await revalidate([`/clients/${existing.client_id}`])
  return { deleted: input.id }
}

// =============================================================================
// WEEKLY REPORTS
// =============================================================================
// Single header row + JSONB arrays for the section data, so the agent can
// build a report incrementally through conversation. PDF rendering lives in
// quotation-pdf.js's sibling file weekly-report-pdf.js.

function isoWeekNumber(d) {
  // ISO 8601 week — Thu of the week determines the year.
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNr = (target.getUTCDay() + 6) % 7
  target.setUTCDate(target.getUTCDate() - dayNr + 3)
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4))
  const weekNo = 1 + Math.round(((target - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
  return { year: target.getUTCFullYear(), week: weekNo }
}

function lastMondayISO(d = new Date()) {
  const day = d.getDay() // 0=Sun .. 6=Sat
  const diff = (day === 0 ? 6 : day - 1)
  const m = new Date(d)
  m.setDate(d.getDate() - diff)
  return m.toISOString().split('T')[0]
}

async function nextReportNumber() {
  const { year, week } = isoWeekNumber(new Date())
  const prefix = `WR-${year}-W${String(week).padStart(2, '0')}`
  const { data } = await supabase
    .from('weekly_reports')
    .select('report_number')
    .like('report_number', `${prefix}%`)
    .order('report_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.report_number
  if (!last) return prefix
  // If a second report is created in the same week, append a -2, -3, etc.
  const m = last.match(/-(\d+)$/)
  const n = m ? parseInt(m[1], 10) + 1 : 2
  return `${prefix}-${n}`
}

async function appendJsonArray(reportId, column, item) {
  const { data: existing, error: fe } = await supabase
    .from('weekly_reports').select(column).eq('id', reportId).single()
  if (fe) throw new Error(`fetch report failed: ${fe.message}`)
  const next = Array.isArray(existing[column]) ? [...existing[column], item] : [item]
  const { error } = await supabase
    .from('weekly_reports').update({ [column]: next }).eq('id', reportId)
  if (error) throw new Error(`append ${column} failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${reportId}`])
  return { added_at_index: next.length - 1, item }
}

async function removeJsonArrayAt(reportId, column, index) {
  const { data: existing, error: fe } = await supabase
    .from('weekly_reports').select(column).eq('id', reportId).single()
  if (fe) throw new Error(`fetch report failed: ${fe.message}`)
  const arr = Array.isArray(existing[column]) ? [...existing[column]] : []
  if (index < 0 || index >= arr.length) {
    return { warning: `index ${index} out of range (size=${arr.length})` }
  }
  const [removed] = arr.splice(index, 1)
  const { error } = await supabase
    .from('weekly_reports').update({ [column]: arr }).eq('id', reportId)
  if (error) throw new Error(`remove ${column} failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${reportId}`])
  return { removed }
}

// Service-block defaults — title + icon for each canonical kind.
const SERVICE_KIND_DEFAULTS = {
  seo:        { title: 'SEO',                icon: '🔍' },
  cold_mail:  { title: 'Cold Mailing',       icon: '✉️' },
  social:     { title: 'Social Media',       icon: '📱' },
  paid_promo: { title: 'Paid Promotions',    icon: '🎯' },
  content:    { title: 'Content Production', icon: '🎬' },
  branding:   { title: 'Branding & Design',  icon: '🎨' },
  web:        { title: 'Website / Landing',  icon: '🌐' },
  custom:     { title: 'Service',            icon: '⭐' },
}

function newId() {
  // Cheap unique-ish id (36 chars). Avoids randomUUID dependency.
  return 'svc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

async function createWeeklyReport(input) {
  const client_id = await resolveClientIdByName(input.client_company_name)
  const period_end = input.period_end || new Date().toISOString().split('T')[0]
  const period_start = input.period_start || lastMondayISO()
  const report_number = await nextReportNumber()

  const customer_name = input.customer_name ?? input.client_company_name ?? null

  const row = {
    report_number,
    client_id,
    client_name_snapshot: customer_name,
    customer_name,
    customer_company: input.customer_company ?? null,
    cover_image_url: input.cover_image_url ?? null,
    period_start,
    period_end,
    issue_date: new Date().toISOString().split('T')[0],
    summary: input.summary ?? null,
    notes: input.notes ?? null,
    services: [],
  }
  const { data, error } = await supabase.from('weekly_reports').insert(row).select().single()
  if (error) throw new Error(`insert weekly_reports failed: ${error.message}`)

  await revalidate(['/reports', '/'])
  return {
    id: data.id,
    report_number: data.report_number,
    period_start: data.period_start,
    period_end: data.period_end,
    url: `${DASHBOARD_URL}/reports/${data.id}`,
    linked_client_id: client_id,
    ...(input.client_company_name && !client_id
      ? { warning: `no CRM client matched "${input.client_company_name}" — saved unlinked.` }
      : {}),
  }
}

async function findWeeklyReport(input) {
  const { data, error } = await supabase
    .from('weekly_reports')
    .select('id, report_number, customer_name, customer_company, client_name_snapshot, period_start, period_end, status, services')
    .or(
      `report_number.ilike.%${input.query}%,customer_name.ilike.%${input.query}%,customer_company.ilike.%${input.query}%,client_name_snapshot.ilike.%${input.query}%`,
    )
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(`weekly_reports search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateWeeklyReport(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'customer_name', 'customer_company',
    'period_start', 'period_end', 'summary', 'notes',
    'cover_image_url', 'status',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  // Keep the legacy snapshot column in sync — old viewer paths still read it.
  if (patch.customer_name) patch.client_name_snapshot = patch.customer_name
  const { data, error } = await supabase
    .from('weekly_reports').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update weekly_reports failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${id}`])
  return { id: data.id, updated_fields: Object.keys(patch), report_number: data.report_number }
}

async function deleteWeeklyReport(input) {
  const { error } = await supabase.from('weekly_reports').delete().eq('id', input.id)
  if (error) throw new Error(`delete weekly_reports failed: ${error.message}`)
  await revalidate(['/reports', '/'])
  return { deleted: input.id }
}

// ---- Service blocks -------------------------------------------------------
// Each block is a self-contained section the user picks for the report:
// SEO, cold mailing, social media, paid promotions, etc. Stored as a JSONB
// array on weekly_reports.services so the agent can build/edit one block at
// a time through conversation.

function normalizeServiceFields(input, prev) {
  const defaults = SERVICE_KIND_DEFAULTS[input.kind] ?? SERVICE_KIND_DEFAULTS.custom
  const out = {
    title: input.title ?? prev?.title ?? defaults.title,
    icon: input.icon ?? prev?.icon ?? defaults.icon,
    body: input.body ?? prev?.body ?? null,
  }
  if ('metrics' in input) {
    out.metrics = (input.metrics ?? []).map((m) => ({
      label: m.label,
      value: m.value,
    }))
  }
  if ('items' in input) {
    out.items = (input.items ?? []).map((i) => ({
      title: i.title,
      detail: i.detail ?? null,
    }))
  }
  if ('images' in input) {
    out.images = (input.images ?? []).map((i) => ({
      url: i.url,
      caption: i.caption ?? null,
    }))
  }
  return out
}

async function addReportService(input) {
  const defaults = SERVICE_KIND_DEFAULTS[input.kind] ?? SERVICE_KIND_DEFAULTS.custom
  const norm = normalizeServiceFields(input, null)
  const block = {
    id: newId(),
    kind: input.kind,
    title: norm.title,
    icon: norm.icon,
    body: norm.body,
    metrics: norm.metrics ?? [],
    items: norm.items ?? [],
    images: norm.images ?? [],
  }
  const { data: existing, error: fe } = await supabase
    .from('weekly_reports').select('services').eq('id', input.report_id).single()
  if (fe) throw new Error(`fetch report failed: ${fe.message}`)
  const next = [...(Array.isArray(existing.services) ? existing.services : []), block]
  const { error } = await supabase
    .from('weekly_reports').update({ services: next }).eq('id', input.report_id)
  if (error) throw new Error(`add service failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${input.report_id}`])
  return { service_id: block.id, kind: block.kind, title: block.title }
}

async function updateReportService(input) {
  const { data: existing, error: fe } = await supabase
    .from('weekly_reports').select('services').eq('id', input.report_id).single()
  if (fe) throw new Error(`fetch report failed: ${fe.message}`)
  const list = Array.isArray(existing.services) ? [...existing.services] : []
  const idx = list.findIndex((s) => s.id === input.service_id)
  if (idx < 0) throw new Error(`service ${input.service_id} not found in report`)
  const norm = normalizeServiceFields(input, list[idx])
  list[idx] = {
    ...list[idx],
    title: norm.title,
    icon: norm.icon,
    body: norm.body,
    ...(norm.metrics !== undefined ? { metrics: norm.metrics } : {}),
    ...(norm.items !== undefined ? { items: norm.items } : {}),
    ...(norm.images !== undefined ? { images: norm.images } : {}),
  }
  const { error } = await supabase
    .from('weekly_reports').update({ services: list }).eq('id', input.report_id)
  if (error) throw new Error(`update service failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${input.report_id}`])
  return { service_id: input.service_id, kind: list[idx].kind, title: list[idx].title }
}

async function removeReportService(input) {
  const { data: existing, error: fe } = await supabase
    .from('weekly_reports').select('services').eq('id', input.report_id).single()
  if (fe) throw new Error(`fetch report failed: ${fe.message}`)
  const list = Array.isArray(existing.services)
    ? existing.services.filter((s) => s.id !== input.service_id)
    : []
  const { error } = await supabase
    .from('weekly_reports').update({ services: list }).eq('id', input.report_id)
  if (error) throw new Error(`remove service failed: ${error.message}`)
  await revalidate(['/reports', `/reports/${input.report_id}`])
  return { removed: input.service_id }
}

// ---- Image upload ----------------------------------------------------------
// Hosts an image in the report-images Supabase Storage bucket and returns
// its public URL. Accepts either a fetchable URL or raw base64 bytes.
async function uploadImage(input) {
  if (!input.image_url && !input.image_data) {
    throw new Error('upload_image requires either image_url or image_data')
  }

  let bytes
  let mime = input.mime
  if (input.image_data) {
    if (!mime) throw new Error('image_data requires a mime type')
    bytes = Buffer.from(input.image_data, 'base64')
  } else {
    const res = await fetch(input.image_url)
    if (!res.ok) throw new Error(`fetch image failed: ${res.status}`)
    bytes = Buffer.from(await res.arrayBuffer())
    if (!mime) mime = res.headers.get('content-type') || 'application/octet-stream'
  }

  const ext = (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin'
  const slug = (input.filename_hint || 'image')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'image'
  const path = `${new Date().toISOString().split('T')[0]}/${slug}-${Date.now()}.${ext}`

  const { error } = await supabase.storage
    .from('report-images')
    .upload(path, bytes, { contentType: mime, upsert: false })
  if (error) throw new Error(`upload failed: ${error.message}`)

  const { data: pub } = supabase.storage.from('report-images').getPublicUrl(path)
  return { public_url: pub.publicUrl, path, bytes_uploaded: bytes.length }
}

// ---- PDF render + send -----------------------------------------------------
async function sendWeeklyReportPdf(input) {
  if (!isReady()) throw new Error('WhatsApp socket not ready')

  const { data: report, error } = await supabase
    .from('weekly_reports').select('*').eq('id', input.id).maybeSingle()
  if (error) throw new Error(`fetch report failed: ${error.message}`)
  if (!report) throw new Error(`weekly_reports ${input.id} not found`)

  let pdf
  try {
    const { generateWeeklyReportPdf } = await import('../weekly-report-pdf.js')
    pdf = await generateWeeklyReportPdf(report)
  } catch (err) {
    console.error('[send_weekly_report_pdf] render failed for', input.id, ':', err?.message ?? err)
    throw new Error(`PDF render failed: ${err?.message ?? err}`)
  }

  const { sock, userJid } = getSock()
  const fileName = `${report.report_number}.pdf`
  try {
    await sock.sendMessage(userJid, {
      document: pdf,
      mimetype: 'application/pdf',
      fileName,
      caption: `${report.report_number} — ${report.client_name_snapshot ?? 'weekly report'}`,
    })
  } catch (err) {
    console.error('[send_weekly_report_pdf] WhatsApp send failed for', input.id, ':', err?.message ?? err)
    throw new Error(`WhatsApp send failed: ${err?.message ?? err}`)
  }

  return { sent: true, report_number: report.report_number, bytes: pdf.length, fileName }
}

// =============================================================================
// AGENCY SETTINGS
// =============================================================================
// One-row config table keyed on id='default'. Token is encrypted at rest with
// the same scheme as social_accounts; never returned by get_agency_settings.

async function getAgencySettings() {
  const { data, error } = await supabase
    .from('agency_settings')
    .select('agency_name, support_email, whatsapp_provider, updated_at')
    .eq('id', 'default')
    .maybeSingle()
  if (error) throw new Error(`fetch agency_settings failed: ${error.message}`)
  return data ?? {}
}

async function updateAgencySettings(input) {
  const patch = pickDefined(input, ['agency_name', 'support_email', 'whatsapp_provider'])
  if (
    input.whatsapp_api_token !== undefined &&
    input.whatsapp_api_token !== null &&
    input.whatsapp_api_token !== ''
  ) {
    patch.whatsapp_api_token_encrypted = mockSecureEncrypt(input.whatsapp_api_token)
  }
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  patch.updated_at = new Date().toISOString()
  const { error } = await supabase
    .from('agency_settings')
    .upsert({ id: 'default', ...patch }, { onConflict: 'id' })
  if (error) throw new Error(`update agency_settings failed: ${error.message}`)
  await revalidate(['/settings', '/'])
  // Don't echo the token even hashed — keep it out of conversation logs.
  const updated = Object.keys(patch).filter(k => k !== 'updated_at' && k !== 'whatsapp_api_token_encrypted')
  if (patch.whatsapp_api_token_encrypted) updated.push('whatsapp_api_token (rotated)')
  return { updated_fields: updated }
}

// =============================================================================
// COMMUNICATION-LOG CRUD (find/update/delete — the insert is logCommunication above)
// =============================================================================

async function findCommunicationLogs(input) {
  let q = supabase.from('communication_logs').select('id, client_id, type, summary, notes, date, created_at').order('date', { ascending: false })
  let clientId = input.client_id
  if (!clientId && input.client_company_name) {
    const { data: c } = await supabase.from('clients').select('id').ilike('company_name', `%${input.client_company_name}%`).limit(1).maybeSingle()
    clientId = c?.id
  }
  if (clientId) q = q.eq('client_id', clientId)
  if (input.type) q = q.eq('type', input.type)
  if (input.since_iso) q = q.gte('date', input.since_iso)
  q = q.limit(Math.max(1, Math.min(200, input.limit ?? 20)))
  const { data, error } = await q
  if (error) throw new Error(`find communication_logs failed: ${error.message}`)
  return { count: data.length, rows: data }
}

async function updateCommunicationLog(input) {
  const patch = {}
  for (const k of ['type', 'summary', 'notes', 'date']) {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  if (Object.keys(patch).length === 0) return { updated: false, reason: 'nothing to update' }
  const { data, error } = await supabase
    .from('communication_logs').update(patch).eq('id', input.id).select('id, client_id').single()
  if (error) throw new Error(`update communication_logs failed: ${error.message}`)
  if (data?.client_id) await revalidate([`/clients/${data.client_id}`])
  return { updated: true, id: data.id, patched: Object.keys(patch) }
}

async function deleteCommunicationLog(input) {
  const { data: existing } = await supabase
    .from('communication_logs').select('client_id').eq('id', input.id).maybeSingle()
  const { error } = await supabase.from('communication_logs').delete().eq('id', input.id)
  if (error) throw new Error(`delete communication_logs failed: ${error.message}`)
  if (existing?.client_id) await revalidate([`/clients/${existing.client_id}`])
  return { deleted: true, id: input.id }
}

// =============================================================================
// CUSTOM NOTIFICATION INSERT (the rest of the notification tools live elsewhere)
// =============================================================================

async function addNotification(input) {
  const title = String(input.title ?? '').trim()
  const message = String(input.message ?? '').trim()
  if (!title) throw new Error('title is required')
  if (!message) throw new Error('message is required')

  // Resolve target user. Three paths in order of specificity:
  //   1. Explicit user_id (auth uuid) → use directly
  //   2. team_member_id → look up team_members.user_id
  //   3. Neither → admin-broadcast (user_id null)
  let userId = input.user_id ?? null
  if (!userId && input.team_member_id) {
    const { data: tm } = await supabase
      .from('team_members').select('user_id').eq('id', input.team_member_id).maybeSingle()
    userId = tm?.user_id ?? null
  }

  const row = {
    user_id: userId,
    title,
    message,
    type: input.type || 'system',
    related_id: input.related_id ?? null,
    is_read: false,
  }
  const { data, error } = await supabase.from('notifications').insert(row).select('id').single()
  if (error) throw new Error(`insert notifications failed: ${error.message}`)
  await revalidate(['/notifications', '/'])
  return {
    id: data.id,
    targeted: userId ? 'user' : 'admin-broadcast',
    user_id: userId,
  }
}

// =============================================================================
// CLIENT-FILE UPDATE (rename / recategorize / reassign)
// =============================================================================

async function updateClientFile(input) {
  const patch = {}
  for (const k of ['name', 'category', 'client_id', 'file_type', 'file_path', 'file_size']) {
    if (input[k] !== undefined) patch[k] = input[k]
  }
  if (Object.keys(patch).length === 0) return { updated: false, reason: 'nothing to update' }
  const { data, error } = await supabase
    .from('client_files').update(patch).eq('id', input.id).select('id, client_id, name, category').single()
  if (error) throw new Error(`update client_files failed: ${error.message}`)
  await revalidate(['/files', data.client_id ? `/clients/${data.client_id}` : '/clients'])
  return { updated: true, id: data.id, patched: Object.keys(patch), name: data.name, category: data.category }
}

// =============================================================================
// BULK-SCHEDULE WEEKLY REPORTS (mirrors the new-client wizard's helper)
// =============================================================================

function _isoYearWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dn = (t.getUTCDay() + 6) % 7
  t.setUTCDate(t.getUTCDate() - dn + 3)
  const ft = new Date(Date.UTC(t.getUTCFullYear(), 0, 4))
  const w = 1 + Math.round(((t.getTime() - ft.getTime()) / 86_400_000 - 3 + ((ft.getUTCDay() + 6) % 7)) / 7)
  return { year: t.getUTCFullYear(), week: w }
}
function _addDays(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function _nextMondayIso() {
  const d = new Date()
  const day = d.getDay()
  const adj = day === 1 ? 0 : ((8 - day) % 7 || 0)
  d.setDate(d.getDate() + adj)
  return d.toISOString().slice(0, 10)
}

async function scheduleWeeklyReports(input) {
  // Resolve client
  let clientId = input.client_id
  let clientRow = null
  if (clientId) {
    const { data } = await supabase.from('clients').select('id, company_name, full_name, email').eq('id', clientId).maybeSingle()
    clientRow = data
  } else if (input.client_company_name) {
    const { data } = await supabase.from('clients').select('id, company_name, full_name, email').ilike('company_name', `%${input.client_company_name}%`).limit(1).maybeSingle()
    clientRow = data
    clientId = data?.id
  }
  if (!clientId || !clientRow) throw new Error('client not found — pass client_id or client_company_name')

  // Resolve assignee
  let assigneeId = input.assignee_team_member_id
  let assigneeRow = null
  if (assigneeId) {
    const { data } = await supabase.from('team_members').select('id, user_id, full_name').eq('id', assigneeId).maybeSingle()
    assigneeRow = data
  } else if (input.assignee_name) {
    const { data } = await supabase.from('team_members').select('id, user_id, full_name').ilike('full_name', `%${input.assignee_name}%`).limit(1).maybeSingle()
    assigneeRow = data
    assigneeId = data?.id
  }
  if (!assigneeId || !assigneeRow) throw new Error('assignee team member not found — pass assignee_team_member_id or assignee_name')

  const weeks = Math.max(1, Math.min(52, input.weeks ?? 12))
  const start = input.start_date_iso || _nextMondayIso()
  const sixCharSlug = (clientRow.company_name || 'CL').replace(/[^A-Za-z0-9]+/g, '').slice(0, 6).toUpperCase() || 'CL'

  const rows = []
  for (let i = 0; i < weeks; i++) {
    const periodStart = _addDays(start, i * 7)
    const { year, week } = _isoYearWeek(new Date(periodStart + 'T00:00:00Z'))
    rows.push({
      client_id: clientId,
      client_name_snapshot: clientRow.full_name,
      customer_name: clientRow.full_name,
      customer_company: clientRow.company_name,
      period_start: periodStart,
      period_end: _addDays(periodStart, 6),
      issue_date: _addDays(periodStart, 7),
      status: 'draft',
      report_number: `WR-${year}-W${String(week).padStart(2, '0')}-${sixCharSlug}`,
      assignee_id: assigneeId,
      prepared_for_contact: clientRow.full_name,
      prepared_for_email: clientRow.email,
      services: [],
    })
  }
  const { data: inserted, error } = await supabase
    .from('weekly_reports').insert(rows).select('id, report_number, period_start')
  if (error) throw new Error(`weekly_reports insert failed: ${error.message}`)

  // Notify the assignee in one summary message (the dashboard's existing
  // notifications relay forwards this to their WhatsApp automatically).
  await supabase.from('notifications').insert({
    user_id: assigneeRow.user_id ?? null,
    title: `Weekly reports assigned: ${clientRow.company_name}`,
    message:
      `${assigneeRow.full_name}, you've been set as the owner of ${weeks} weekly reports for ${clientRow.company_name}. ` +
      `First period: ${start} → ${_addDays(start, 6)}. Check the Calendar / Weekly Reports page when the first one is due.`,
    type: 'report_assigned',
    related_id: clientId,
    is_read: false,
  }).catch((e) => console.warn('[schedule_weekly_reports] notif insert failed:', e?.message ?? e))

  await revalidate(['/reports', '/calendar', '/notifications', `/clients/${clientId}`])

  return {
    scheduled: weeks,
    client: clientRow.company_name,
    assignee: assigneeRow.full_name,
    first_period_start: rows[0].period_start,
    last_period_end: rows[rows.length - 1].period_end,
    report_numbers: inserted.map((r) => r.report_number),
  }
}

// =============================================================================
// ACCOUNTING / VAT INVOICES — receipt → draft → approve → push to Qoyod
// =============================================================================

async function _nextInvoiceNumber() {
  const year = new Date().getFullYear()
  const prefix = `INV-${year}-`
  const { data } = await supabase
    .from('accounting_invoices')
    .select('invoice_number')
    .like('invoice_number', `${prefix}%`)
    .order('invoice_number', { ascending: false })
    .limit(1)
  const last = data?.[0]?.invoice_number
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

// Resolve an id passed by the LLM that might be either a UUID or an
// invoice_number ("INV-2026-001"). Returns the UUID or null.
async function _resolveInvoiceId(idOrNumber) {
  if (!idOrNumber) return null
  // Quick heuristic: UUIDs contain hyphens at fixed positions and are 36 chars
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(idOrNumber)) return idOrNumber
  const { data } = await supabase
    .from('accounting_invoices')
    .select('id')
    .eq('invoice_number', idOrNumber)
    .maybeSingle()
  return data?.id ?? null
}

async function createDraftInvoice(input) {
  const currency = input.currency || 'SAR'
  const vat_rate = input.vat_rate ?? 15
  let line_items = Array.isArray(input.line_items) ? input.line_items : []

  // If no lines provided but a quotation_id is, copy that quote's items so
  // the admin doesn't have to retype them.
  if (line_items.length === 0 && input.quotation_id) {
    const { data: qItems } = await supabase
      .from('quotation_items')
      .select('name, description, qty, unit_price, pricing_mode, percentage')
      .eq('quotation_id', input.quotation_id)
      .order('position')
    if (qItems?.length) {
      line_items = qItems
        .filter((it) => it.pricing_mode !== 'percentage')   // skip profit-share lines — they don't have a fixed value
        .map((it) => ({
          description: it.name + (it.description ? ` — ${it.description}` : ''),
          qty: Number(it.qty ?? 1),
          unit_price: Number(it.unit_price ?? 0),
          vat_rate,
        }))
    }
  }

  // Last resort: build a single placeholder line from the total.
  if (line_items.length === 0 && (input.total || input.subtotal)) {
    const sub = input.subtotal ?? Math.round(((input.total ?? 0) / (1 + vat_rate / 100)) * 100) / 100
    line_items = [{
      description: 'Services rendered (auto-extracted — please edit before approving)',
      qty: 1, unit_price: sub, vat_rate,
    }]
  }

  // Compute totals
  const computedLines = line_items.map((l) => {
    const subtotal = Number(l.qty ?? 1) * Number(l.unit_price ?? 0)
    const vat = Math.round(subtotal * Number(l.vat_rate ?? vat_rate)) / 100
    return { ...l, vat_amount: vat, line_total: subtotal }
  })
  const subtotal = computedLines.reduce((s, l) => s + Number(l.line_total ?? 0), 0)
  const vat_amount = Math.round(subtotal * vat_rate) / 100
  const total = input.total ?? Math.round((subtotal + vat_amount) * 100) / 100

  const invoice_number = await _nextInvoiceNumber()
  const row = {
    client_id: input.client_id ?? null,
    quotation_id: input.quotation_id ?? null,
    contract_id: input.contract_id ?? null,
    receipt_url: input.receipt_url ?? null,
    invoice_number,
    issue_date: new Date().toISOString().slice(0, 10),
    payment_date: input.payment_date ?? null,
    payment_method: input.payment_method ?? null,
    payment_reference: input.payment_reference ?? null,
    customer_name: input.customer_name ?? null,
    customer_vat: input.customer_vat ?? null,
    customer_cr: input.customer_cr ?? null,
    customer_address: input.customer_address ?? null,
    currency,
    line_items: computedLines,
    subtotal,
    vat_rate,
    vat_amount,
    total,
    notes: input.notes ?? null,
    status: 'draft',
  }
  const { data, error } = await supabase
    .from('accounting_invoices').insert(row).select('id, invoice_number').single()
  if (error) throw new Error(`create draft invoice failed: ${error.message}`)

  // Admin-broadcast notification so the bell pings.
  await supabase.from('notifications').insert({
    user_id: null,
    title: `Draft VAT invoice ${data.invoice_number}`,
    message: `${input.customer_name || 'Client'} — ${total.toLocaleString('en-US')} ${currency} (VAT ${vat_amount.toLocaleString('en-US')}). Review at /accounting/${data.id}.`,
    type: 'invoice_draft',
    related_id: data.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/accounting', '/notifications'])
  return { id: data.id, invoice_number: data.invoice_number, total, vat_amount, currency }
}

async function findInvoices(input) {
  let q = supabase.from('accounting_invoices')
    .select('id, invoice_number, customer_name, total, vat_amount, currency, status, payment_date, issue_date, created_at')
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, input.limit ?? 20)))
  if (input.status) q = q.eq('status', input.status)
  if (input.client_id) q = q.eq('client_id', input.client_id)
  if (input.q) q = q.or(`customer_name.ilike.%${input.q}%,invoice_number.ilike.%${input.q}%`)
  const { data, error } = await q
  if (error) throw new Error(`find invoices failed: ${error.message}`)
  return { count: data.length, rows: data }
}

async function approveInvoiceTool(input) {
  const id = await _resolveInvoiceId(input.id)
  if (!id) throw new Error(`invoice not found: ${input.id}`)
  const { data, error } = await supabase
    .from('accounting_invoices')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
    .select('invoice_number')
    .single()
  if (error) throw new Error(`approve failed: ${error.message}`)
  if (!data) throw new Error('Invoice is not in draft status (already approved/pushed/void).')
  await revalidate(['/accounting', `/accounting/${id}`])
  return { approved: true, invoice_number: data.invoice_number, id }
}

async function pushInvoiceTool(input) {
  const id = await _resolveInvoiceId(input.id)
  if (!id) throw new Error(`invoice not found: ${input.id}`)
  const { data: inv } = await supabase
    .from('accounting_invoices').select('status, total, currency').eq('id', id).maybeSingle()
  if (!inv) throw new Error('invoice not found')
  if (inv.status !== 'approved') throw new Error(`Invoice must be approved first (currently: ${inv.status}).`)

  const { data: settings } = await supabase
    .from('agency_settings').select('qoyod_api_token_encrypted').eq('id', 'default').maybeSingle()
  if (!settings?.qoyod_api_token_encrypted) {
    await supabase.from('accounting_invoices').update({
      push_error: 'Qoyod API token not configured.',
    }).eq('id', id)
    throw new Error('Qoyod API token not configured. Open dashboard Settings → Accounting and paste the access token from Qoyod (Settings → Developers → API). Once it\'s in, retry push.')
  }
  // Real push happens once admin loads the token. Returning the gated
  // error here so the agent reports back to the user faithfully.
  throw new Error('Qoyod push not yet implemented in the agent — same blocker as the dashboard. Will be enabled the moment the API token + branch/account IDs land in agency_settings.')
}

// =============================================================================
// REGISTRY
// =============================================================================

const registry = {
  // long-term memory
  remember_fact: doRememberFact,
  forget_fact: doForgetFact,
  // quotations
  create_quotation: createQuotation,
  add_quotation_item: addQuotationItem,
  find_quotation: findQuotation,
  update_quotation: updateQuotation,
  set_quotation_status: setQuotationStatus,
  remove_quotation_item: removeQuotationItem,
  delete_quotation: deleteQuotationExec,
  send_quotation_pdf: sendQuotationPdf,
  // clients
  add_client: addClient,
  find_client: findClient,
  update_client: updateClient,
  add_client_note: addClientNote,
  delete_client: deleteClient,
  // reminders
  add_reminder: addReminder,
  find_reminder: findReminder,
  update_reminder: updateReminder,
  delete_reminder: deleteReminder,
  // tasks
  add_task: addTask,
  find_task: findTask,
  update_task: updateTask,
  delete_task: deleteTask,
  // contracts
  add_contract: addContract,
  find_contract: findContract,
  update_contract: updateContract,
  delete_contract: deleteContract,
  // contract payments + task→contract link
  add_contract_payment: addContractPayment,
  mark_payment_paid: markPaymentPaid,
  update_contract_payment: updateContractPayment,
  find_contract_payments: findContractPayments,
  delete_contract_payment: deleteContractPayment,
  link_task_to_contract: linkTaskToContract,
  // social_accounts
  add_social_account: addSocialAccount,
  find_social_account: findSocialAccount,
  update_social_account: updateSocialAccount,
  set_default_social_account: setDefaultSocialAccount,
  delete_social_account: deleteSocialAccount,
  // campaigns
  add_campaign: addCampaign,
  find_campaign: findCampaign,
  update_campaign: updateCampaign,
  delete_campaign: deleteCampaign,
  // team
  add_team_member: addTeamMember,
  find_team_member: findTeamMember,
  update_team_member: updateTeamMember,
  delete_team_member: deleteTeamMember,
  // comm logs
  log_communication: logCommunication,
  find_communication_logs: findCommunicationLogs,
  update_communication_log: updateCommunicationLog,
  delete_communication_log: deleteCommunicationLog,
  // outbound WhatsApp + email to arbitrary recipients
  send_whatsapp_message: sendWhatsappMessage,
  send_whatsapp_file: sendWhatsappFile,
  send_whatsapp_file_url: sendWhatsappFileUrl,
  send_email: sendEmail,
  read_pdf: readPdf,
  // client services
  add_client_service: addClientService,
  remove_client_service: removeClientService,
  list_client_services: listClientServices,
  // notifications
  find_notifications: findNotifications,
  mark_notification_read: markNotificationRead,
  mark_all_notifications_read: markAllNotificationsRead,
  delete_notification: deleteNotification,
  add_notification: addNotification,
  // content items (social media posts)
  add_content_item: addContentItem,
  find_content_item: findContentItem,
  update_content_item: updateContentItem,
  delete_content_item: deleteContentItem,
  // client files
  list_client_files: listClientFiles,
  add_client_file_link: addClientFileLink,
  update_client_file: updateClientFile,
  delete_client_file: deleteClientFile,
  // agency settings
  get_agency_settings: getAgencySettings,
  update_agency_settings: updateAgencySettings,
  // accounting (VAT invoices)
  create_draft_invoice: createDraftInvoice,
  find_invoices: findInvoices,
  approve_invoice: approveInvoiceTool,
  push_invoice: pushInvoiceTool,
  // weekly reports — service-block model
  create_weekly_report: createWeeklyReport,
  find_weekly_report: findWeeklyReport,
  update_weekly_report: updateWeeklyReport,
  delete_weekly_report: deleteWeeklyReport,
  schedule_weekly_reports: scheduleWeeklyReports,
  add_report_service: addReportService,
  update_report_service: updateReportService,
  remove_report_service: removeReportService,
  upload_image: uploadImage,
  send_weekly_report_pdf: sendWeeklyReportPdf,
  // power tools
  db_describe: dbDescribe,
  db_select: dbSelect,
  db_insert: dbInsert,
  db_update: dbUpdate,
  db_delete: dbDelete,
  db_count: dbCount,
  db_query: dbQuery,
  db_migrate: dbMigrate,
  run_code: runCode,
  // developer mode — file/shell access on the user's laptop
  read_file: devReadFile,
  write_file: devWriteFile,
  edit_file: devEditFile,
  list_dir: devListDir,
  glob_files: devGlob,
  grep_files: devGrep,
  run_shell: devRunShell,
  project_root: devProjectRoot,
}

// =============================================================================
// POWER TOOLS — generic DB access + sandboxed JS execution
// =============================================================================

const POWER_TOOL_NAMES = new Set([
  'db_describe', 'db_select', 'db_insert', 'db_update', 'db_delete',
  'db_count', 'db_query', 'db_migrate', 'run_code',
  // dev-mode writes are also audited so the user can trace destructive
  // ops the agent ran on their laptop.
  'write_file', 'edit_file', 'run_shell',
])

// Audit every power-tool call so there's a paper trail. Best-effort —
// if the audit insert fails (e.g. the agent_audit table doesn't exist
// yet because the migration hasn't been run), we don't fail the tool.
async function audit(tool, payload, result, error) {
  try {
    const ctx = getRequest()
    await supabase.from('agent_audit').insert({
      sender: ctx?.sender ?? null,
      tool,
      payload: payload ?? null,
      result: error ? null : result ?? null,
      error: error ? String(error?.message ?? error) : null,
    })
  } catch (_) { /* swallow */ }
}

// Translate the tool's filter array [{column, op, value}, ...] into
// chained supabase-js where clauses on the given query builder.
function applyFilters(q, filters) {
  for (const f of (filters || [])) {
    const op = f.op || 'eq'
    if (typeof q[op] !== 'function') {
      throw new Error(`unsupported filter op: ${op}`)
    }
    q = q[op](f.column, f.value)
  }
  return q
}

async function dbDescribe() {
  // information_schema.columns through agent_query — gives us a live
  // schema dump regardless of which migrations are applied.
  const { data, error } = await supabase.rpc('agent_query', {
    sql: `
      SELECT
        c.table_name,
        c.column_name,
        c.data_type,
        c.is_nullable,
        c.column_default
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_name = c.table_name AND t.table_schema = c.table_schema
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position
    `,
  })
  if (error) throw new Error(`db_describe failed: ${error.message}`)
  if (data?.error) throw new Error(`db_describe SQL error: ${data.error}`)
  const tables = {}
  for (const row of (data || [])) {
    if (!tables[row.table_name]) tables[row.table_name] = []
    tables[row.table_name].push({
      column: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
    })
  }
  return { tables, table_count: Object.keys(tables).length }
}

async function dbSelect(input) {
  let q = supabase.from(input.table).select(input.columns || '*')
  q = applyFilters(q, input.filters)
  if (input.order_by) {
    q = q.order(input.order_by, { ascending: input.ascending !== false })
  }
  if (input.limit) q = q.limit(input.limit)
  const { data, error } = await q
  if (error) throw new Error(`db_select failed: ${error.message}`)
  return { rows: data ?? [], count: (data ?? []).length }
}

async function dbInsert(input) {
  const { data, error } = await supabase
    .from(input.table)
    .insert(input.data)
    .select()
  if (error) throw new Error(`db_insert failed: ${error.message}`)
  await revalidate(['/'])
  return { inserted: data ?? [], count: (data ?? []).length }
}

async function dbUpdate(input) {
  let q = supabase.from(input.table).update(input.patch)
  q = applyFilters(q, input.filters)
  const { data, error } = await q.select()
  if (error) throw new Error(`db_update failed: ${error.message}`)
  await revalidate(['/'])
  return { updated: data ?? [], count: (data ?? []).length }
}

async function dbDelete(input) {
  let q = supabase.from(input.table).delete()
  q = applyFilters(q, input.filters)
  const { data, error } = await q.select()
  if (error) throw new Error(`db_delete failed: ${error.message}`)
  await revalidate(['/'])
  return { deleted: data ?? [], count: (data ?? []).length }
}

async function dbCount(input) {
  let q = supabase.from(input.table).select('*', { count: 'exact', head: true })
  q = applyFilters(q, input.filters)
  const { count, error } = await q
  if (error) throw new Error(`db_count failed: ${error.message}`)
  return { count: count ?? 0 }
}

async function dbQuery(input) {
  if (!input.sql || typeof input.sql !== 'string') {
    throw new Error('db_query: sql is required')
  }
  // Light client-side guard — the SQL is wrapped inside a SELECT in the
  // RPC, but reject obvious DDL/DML mistakes early so the user gets a
  // clear error rather than a confusing "syntax error at..." from
  // postgres.
  const lower = input.sql.trim().toLowerCase()
  if (/^(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/.test(lower)) {
    throw new Error('db_query is read-only. Use db_migrate for DDL/DML.')
  }
  const { data, error } = await supabase.rpc('agent_query', { sql: input.sql })
  if (error) throw new Error(`db_query failed: ${error.message}`)
  if (data?.error) throw new Error(`db_query SQL error: ${data.error} (${data.sqlstate})`)
  const rows = Array.isArray(data) ? data : []
  return { rows, count: rows.length }
}

async function dbMigrate(input) {
  if (!input.sql || typeof input.sql !== 'string') {
    throw new Error('db_migrate: sql is required')
  }
  const { data, error } = await supabase.rpc('agent_migrate', { sql: input.sql })
  if (error) throw new Error(`db_migrate failed: ${error.message}`)
  if (data?.error) throw new Error(`db_migrate SQL error: ${data.error} (${data.sqlstate})`)
  await revalidate(['/'])
  return { ok: true, sql: input.sql }
}

// run_code: execute JS in a Node vm sandbox with the supabase client
// + fetch + console pre-injected. Async wrapping handled internally so
// the agent can write either a top-level expression or
// `(async () => { ... })()` at its discretion. 30s wall-clock cap.
async function runCode(input) {
  if (!input.code || typeof input.code !== 'string') {
    throw new Error('run_code: code is required')
  }
  const vm = await import('node:vm')

  const logs = []
  const sandboxConsole = {
    log: (...args) => logs.push(args.map(formatArg).join(' ')),
    error: (...args) => logs.push('[error] ' + args.map(formatArg).join(' ')),
    warn: (...args) => logs.push('[warn] ' + args.map(formatArg).join(' ')),
  }

  const context = vm.createContext({
    supabase,
    fetch: globalThis.fetch,
    Buffer,
    console: sandboxConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    URL,
    URLSearchParams,
    // Developer-mode globals so the agent can do file/shell work inline
    // when no specific tool fits. Same access the user has — no sandbox
    // restriction beyond what node:vm gives us (which is just isolated
    // globals, not OS-level isolation).
    fs,
    path: nodePath,
    child_process: nodeChildProcess,
    process: { cwd: () => PROJECT_ROOT, platform: process.platform, env: process.env },
    PROJECT_ROOT,
  })

  // Wrap the agent's code in an async IIFE so it can await freely and
  // we always receive a Promise.
  const wrapped = `(async () => {\n${input.code}\n})()`
  let result, errored
  try {
    const promise = vm.runInContext(wrapped, context, { filename: 'agent-snippet.js' })
    // Race against a 30s timeout so a hung await doesn't hang the agent.
    result = await Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('run_code timed out after 30s')), 30000),
      ),
    ])
  } catch (err) {
    errored = err
  }

  if (errored) {
    return { ok: false, error: String(errored?.message ?? errored), logs }
  }
  // Coerce the return value to a JSON-safe shape so downstream tool
  // serialisation doesn't choke on things like Date or undefined.
  return { ok: true, result: jsonSafe(result), logs }
}

function formatArg(a) {
  if (typeof a === 'string') return a
  try { return JSON.stringify(a) } catch { return String(a) }
}

function jsonSafe(value, depth = 0) {
  if (depth > 10) return '[depth-limit]'
  if (value === null || value === undefined) return value ?? null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (t === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return { message: value.message, stack: value.stack }
  if (Array.isArray(value)) return value.slice(0, 200).map((v) => jsonSafe(v, depth + 1))
  if (Buffer.isBuffer(value)) return `[Buffer ${value.length}b]`
  if (t === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value).slice(0, 100)) {
      out[k] = jsonSafe(v, depth + 1)
    }
    return out
  }
  return String(value)
}

// Override runTool below to wrap power-tool calls with audit logging.
const _origRegistry = registry

export async function runTool(name, input) {
  const fn = _origRegistry[name]
  if (!fn) throw new Error(`unknown tool: ${name}`)
  if (!POWER_TOOL_NAMES.has(name)) {
    return await fn(input)
  }
  // Power-tool path — audit success and failure.
  try {
    const result = await fn(input)
    audit(name, input, result, null).catch(() => {})
    return result
  } catch (err) {
    audit(name, input, null, err).catch(() => {})
    throw err
  }
}
