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

// Low-level Qoyod fetch — mirrors src/lib/qoyod/client.ts. Kept inline
// here so the agent doesn't have to import the dashboard's TS modules.
const QOYOD_BASE = 'https://api.qoyod.com/2.0'
async function _qoyodRequest(apiKey, method, path, body) {
  const res = await fetch(`${QOYOD_BASE}${path}`, {
    method,
    headers: {
      'API-KEY': apiKey,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { /* ignore */ }
  if (!res.ok) {
    const detail = (parsed && (parsed.error || parsed.errors || parsed.message)) || text.slice(0, 300)
    throw new Error(`Qoyod ${res.status} ${method} ${path}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
  return parsed
}

function _fingerprintDesc(s) {
  if (!s) return ''
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 200)
}

async function _ensureQoyodCustomer(apiKey, clientId) {
  if (!clientId) return null
  const { data: c } = await supabase
    .from('clients')
    .select('id, qoyod_customer_id, company_name, full_name, email, phone, whatsapp, city')
    .eq('id', clientId).maybeSingle()
  if (!c) return null
  if (c.qoyod_customer_id) return c.qoyod_customer_id
  const r = await _qoyodRequest(apiKey, 'POST', '/customers', {
    customer: {
      name: c.company_name || c.full_name || 'Client',
      email: c.email || undefined,
      phone: c.whatsapp || c.phone || undefined,
      address: c.city || undefined,
      contact_type: 'organization',
    },
  })
  const qid = r?.customer?.id
  if (qid) await supabase.from('clients').update({ qoyod_customer_id: qid }).eq('id', clientId).catch(() => null)
  return qid
}

async function _ensureQoyodProduct(apiKey, description, unit_price, vat_rate) {
  const fingerprint = _fingerprintDesc(description) || 'misc-service'
  const { data: existing } = await supabase
    .from('qoyod_products').select('qoyod_product_id').eq('fingerprint', fingerprint).maybeSingle()
  if (existing?.qoyod_product_id) return existing.qoyod_product_id
  const r = await _qoyodRequest(apiKey, 'POST', '/products', {
    product: {
      name_en: description.slice(0, 120),
      name_ar: description.slice(0, 120),
      description,
      unit_price,
      tax_percent: vat_rate,
      product_type: 'service',
    },
  })
  const pid = r?.product?.id
  if (pid) {
    await supabase.from('qoyod_products').insert({
      fingerprint, description, qoyod_product_id: pid, default_unit_price: unit_price,
    }).catch(() => null)
  }
  return pid
}

async function pushInvoiceTool(input) {
  const id = await _resolveInvoiceId(input.id)
  if (!id) throw new Error(`invoice not found: ${input.id}`)

  const { data: inv } = await supabase
    .from('accounting_invoices').select('*').eq('id', id).maybeSingle()
  if (!inv) throw new Error('invoice not found')
  if (inv.status !== 'approved') {
    throw new Error(`Invoice must be approved first (currently: ${inv.status}).`)
  }

  const { data: settings } = await supabase
    .from('agency_settings')
    .select('qoyod_api_key, qoyod_default_inventory_id, qoyod_default_payment_account')
    .eq('id', 'default').maybeSingle()
  const apiKey = settings?.qoyod_api_key

  if (!apiKey) {
    await supabase.from('accounting_invoices').update({
      push_error: 'Qoyod API key not configured.',
    }).eq('id', id)
    throw new Error('Qoyod API key not set. Open the dashboard → Settings → Accounting (قيود) and paste the API key from your Qoyod account. Then retry push.')
  }

  try {
    const contact_id = await _ensureQoyodCustomer(apiKey, inv.client_id)
    if (!contact_id) throw new Error('No client_id on invoice — link a CRM client first.')

    const vat_rate = Number(inv.vat_rate ?? 15)
    const lines = Array.isArray(inv.line_items) ? inv.line_items : []
    if (lines.length === 0) throw new Error('Invoice has no line items.')
    const qoyodLines = []
    for (const l of lines) {
      const desc = String(l.description || 'Service')
      const unit_price = Number(l.unit_price ?? 0)
      const product_id = await _ensureQoyodProduct(apiKey, desc, unit_price, vat_rate)
      qoyodLines.push({
        product_id,
        description: desc,
        quantity: Number(l.qty ?? 1),
        unit_price,
        tax_percent: Number(l.vat_rate ?? vat_rate),
      })
    }

    const created = await _qoyodRequest(apiKey, 'POST', '/invoices', {
      invoice: {
        contact_id,
        reference: inv.invoice_number,
        description: inv.notes || undefined,
        issue_date: inv.issue_date,
        due_date: inv.issue_date,
        status: 'Approved',
        inventory_id: settings?.qoyod_default_inventory_id ?? undefined,
        line_items: qoyodLines,
      },
    })

    if (inv.payment_date && settings?.qoyod_default_payment_account) {
      try {
        await _qoyodRequest(apiKey, 'POST', '/invoice_payments', {
          invoice_payment: {
            reference: inv.payment_reference || `pay-${created.invoice.id}`,
            invoice_id: created.invoice.id,
            account_id: settings.qoyod_default_payment_account,
            date: inv.payment_date,
            amount: String(inv.total ?? 0),
            payment_method: inv.payment_method || undefined,
          },
        })
      } catch (payErr) {
        console.warn('[qoyod] payment record failed:', payErr?.message)
      }
    }

    const externalUrl = `https://www.qoyod.com/invoices/${created.invoice.id}`
    await supabase.from('accounting_invoices').update({
      status: 'pushed',
      external_system: 'qoyod',
      external_id: String(created.invoice.id),
      external_url: externalUrl,
      external_pushed_at: new Date().toISOString(),
      push_error: null,
    }).eq('id', id)

    await revalidate(['/accounting', `/accounting/${id}`])
    return {
      pushed: true,
      invoice_number: inv.invoice_number,
      qoyod_invoice_id: created.invoice.id,
      qoyod_url: externalUrl,
    }
  } catch (err) {
    const msg = err?.message ?? 'unknown error'
    await supabase.from('accounting_invoices').update({
      status: 'failed', push_error: msg,
    }).eq('id', id)
    throw new Error(msg)
  }
}

// =============================================================================
// OVERDUE-NAG REPLY HANDLERS — admin replies "send" or "skip" on the
// WhatsApp DM the scheduler sent; the agent dispatches via these tools.
// =============================================================================

async function _resolveNagId(input) {
  if (input.nag_id) return input.nag_id
  if (input.invoice_number && input.stage) {
    const { data: inv } = await supabase
      .from('accounting_invoices').select('id').eq('invoice_number', input.invoice_number).maybeSingle()
    if (!inv) return null
    const { data: nag } = await supabase
      .from('invoice_nag_log')
      .select('id')
      .eq('invoice_id', inv.id)
      .eq('stage', input.stage)
      .eq('status', 'pending')
      .maybeSingle()
    return nag?.id ?? null
  }
  // Last resort: most recent pending
  const { data: latest } = await supabase
    .from('invoice_nag_log').select('id').eq('status', 'pending')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return latest?.id ?? null
}

async function findPendingNagsTool(input) {
  const { data } = await supabase
    .from('invoice_nag_log')
    .select(`
      id, stage, status, draft_text, created_at,
      invoice:invoice_id (id, invoice_number, customer_name, client_id, total, currency, issue_date)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(50, input?.limit ?? 5)))
  return {
    count: data?.length ?? 0,
    rows: (data ?? []).map((r) => ({
      nag_id: r.id,
      stage: r.stage,
      invoice_number: r.invoice?.invoice_number,
      customer_name: r.invoice?.customer_name,
      total: r.invoice?.total,
      currency: r.invoice?.currency,
      issue_date: r.invoice?.issue_date,
      draft_preview: String(r.draft_text || '').slice(0, 240),
    })),
  }
}

async function sendNagTool(input) {
  const nagId = await _resolveNagId(input)
  if (!nagId) throw new Error('No pending nag found. Use find_pending_nags to list them.')
  if (!input.channel || (input.channel !== 'whatsapp' && input.channel !== 'email')) {
    throw new Error('channel must be "whatsapp" or "email".')
  }

  const { data: nag } = await supabase
    .from('invoice_nag_log')
    .select(`
      id, status, draft_text,
      invoice:invoice_id (id, invoice_number, customer_name, client_id, total, currency)
    `).eq('id', nagId).maybeSingle()
  if (!nag) throw new Error('nag not found')
  if (nag.status !== 'pending') throw new Error(`Nag is not pending (currently: ${nag.status}).`)

  const body = (input.edited_body || nag.draft_text || '').trim()
  if (!body) throw new Error('Empty draft — nothing to send.')

  const inv = nag.invoice
  if (!inv?.client_id) throw new Error('Invoice has no client_id linked; cannot resolve recipient.')

  const { data: client } = await supabase
    .from('clients').select('email, whatsapp, phone, company_name, full_name')
    .eq('id', inv.client_id).maybeSingle()
  if (!client) throw new Error('Client record not found.')

  if (input.channel === 'whatsapp') {
    const phone = client.whatsapp || client.phone
    if (!phone) throw new Error('Client has no whatsapp/phone on file — try channel="email" or update the client first.')
    // Reuse the outbound send. Don't bump last_contacted as a side effect here
    // because the marker is "we collected a payment", not "we made outreach".
    await sendWhatsappMessage({ to_phone: phone, text: body, client_id: inv.client_id })
  } else {
    // Email — call sendEmail executor directly. It takes care of fallback FROM.
    const r = await sendEmail({
      to: client.email,
      subject: `Payment reminder — ${inv.invoice_number} (${Number(inv.total ?? 0).toLocaleString('en-US')} ${inv.currency || 'SAR'})`,
      text: body,
      client_id: inv.client_id,
    })
    if (!r?.sent) throw new Error('Email send failed.')
  }

  await supabase.from('invoice_nag_log').update({
    status: 'sent',
    channel: input.channel,
    draft_text: body,
    sent_at: new Date().toISOString(),
  }).eq('id', nagId).eq('status', 'pending')

  await revalidate(['/accounting/nags'])
  return {
    sent: true,
    channel: input.channel,
    invoice_number: inv.invoice_number,
  }
}

async function skipNagTool(input) {
  const nagId = await _resolveNagId(input)
  if (!nagId) throw new Error('No pending nag found. Use find_pending_nags to list them.')
  const { error } = await supabase
    .from('invoice_nag_log').update({ status: 'skipped' })
    .eq('id', nagId).eq('status', 'pending')
  if (error) throw new Error(`skip failed: ${error.message}`)
  await revalidate(['/accounting/nags'])
  return { skipped: true }
}

// =============================================================================
// BILLS / EXPENSES — AP side of accounting. Mirrors invoice tooling.
// Workflow: vendor receipt → create_draft_bill → admin approve_bill →
// push_bill → Qoyod /bills or /simple_bills. Same Qoyod fetch helper
// (_qoyodRequest) reused.
// =============================================================================

async function _nextBillReference() {
  const year = new Date().getFullYear()
  const prefix = `BILL-${year}-`
  const { data } = await supabase
    .from('accounting_bills')
    .select('bill_reference')
    .like('bill_reference', `${prefix}%`)
    .order('bill_reference', { ascending: false })
    .limit(1)
  const last = data?.[0]?.bill_reference
  const n = last ? parseInt(last.slice(prefix.length), 10) + 1 : 1
  return `${prefix}${String(n).padStart(3, '0')}`
}

async function _resolveBillId(idOrRef) {
  if (!idOrRef) return null
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrRef)) {
    return idOrRef
  }
  const { data } = await supabase
    .from('accounting_bills')
    .select('id')
    .eq('bill_reference', idOrRef)
    .maybeSingle()
  return data?.id ?? null
}

function _vendorFingerprint(s) {
  if (!s) return ''
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 120)
}

async function suggestBillCategoryTool(input) {
  const fp = _vendorFingerprint(input.vendor_name)
  if (!fp) return null
  const { data } = await supabase
    .from('expense_category_mappings')
    .select('category, qoyod_expense_account_id, hit_count')
    .eq('vendor_fingerprint', fp)
    .maybeSingle()
  return data ?? null
}

async function _rememberBillCategory(vendor_name, category, qoyod_expense_account_id) {
  const fp = _vendorFingerprint(vendor_name)
  if (!fp || !category) return
  const { data: existing } = await supabase
    .from('expense_category_mappings')
    .select('id, hit_count')
    .eq('vendor_fingerprint', fp)
    .maybeSingle()
  if (existing) {
    await supabase.from('expense_category_mappings').update({
      category,
      qoyod_expense_account_id: qoyod_expense_account_id ?? null,
      hit_count: (existing.hit_count ?? 0) + 1,
      last_used_at: new Date().toISOString(),
    }).eq('id', existing.id)
  } else {
    await supabase.from('expense_category_mappings').insert({
      vendor_fingerprint: fp,
      vendor_name_sample: vendor_name,
      category,
      qoyod_expense_account_id: qoyod_expense_account_id ?? null,
    })
  }
}

async function createDraftBillTool(input) {
  const currency = input.currency || 'SAR'
  const vat_rate = input.vat_rate ?? 15

  // Pre-fill category from learned mapping if admin didn't override.
  let category = input.category ?? null
  let qoyod_expense_account_id = null
  if (!category) {
    const sugg = await suggestBillCategoryTool({ vendor_name: input.vendor_name })
    if (sugg?.category) {
      category = sugg.category
      qoyod_expense_account_id = sugg.qoyod_expense_account_id ?? null
    }
  }

  let line_items = Array.isArray(input.line_items) ? input.line_items : []
  // Simple receipt (cash purchase, one-line ticket) — auto-build a
  // placeholder line so the admin only has to confirm.
  if (line_items.length === 0 && (input.total || input.subtotal)) {
    const sub = input.subtotal ?? Math.round(((input.total ?? 0) / (1 + vat_rate / 100)) * 100) / 100
    line_items = [{
      description: `${input.vendor_name} — auto-extracted from receipt (please edit before approving)`,
      qty: 1, unit_price: sub, vat_rate,
    }]
  }

  const computedLines = line_items.map((l) => {
    const subtotal = Number(l.qty ?? 1) * Number(l.unit_price ?? 0)
    const vat = Math.round(subtotal * Number(l.vat_rate ?? vat_rate)) / 100
    return { ...l, vat_amount: vat, line_total: subtotal }
  })
  const subtotal = computedLines.reduce((s, l) => s + Number(l.line_total ?? 0), 0)
  const vat_amount = input.vat_amount ?? Math.round(subtotal * vat_rate) / 100
  const total = input.total ?? Math.round((subtotal + vat_amount) * 100) / 100

  const bill_reference = await _nextBillReference()
  const row = {
    vendor_name: input.vendor_name,
    vendor_vat: input.vendor_vat ?? null,
    vendor_cr: input.vendor_cr ?? null,
    vendor_address: input.vendor_address ?? null,
    receipt_url: input.receipt_url ?? null,
    bill_number: input.bill_number ?? null,
    bill_reference,
    issue_date: input.issue_date ?? new Date().toISOString().slice(0, 10),
    due_date: input.due_date ?? null,
    payment_date: input.payment_date ?? null,
    payment_method: input.payment_method ?? null,
    payment_reference: input.payment_reference ?? null,
    category,
    qoyod_expense_account_id,
    is_simple: !!input.is_simple,
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
    .from('accounting_bills').insert(row).select('id, bill_reference').single()
  if (error) throw new Error(`create draft bill failed: ${error.message}`)

  await supabase.from('notifications').insert({
    user_id: null,
    title: `Draft bill ${data.bill_reference}`,
    message: `${input.vendor_name} — ${total.toLocaleString('en-US')} ${currency}${category ? ` · ${category}` : ''}. Review at /accounting/bills/${data.id}.`,
    type: 'bill_draft',
    related_id: data.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/accounting/bills', '/notifications'])
  return {
    id: data.id,
    bill_reference: data.bill_reference,
    total, vat_amount, currency, category,
    suggested_from_history: !input.category && !!category,
  }
}

async function findBillsTool(input) {
  let q = supabase.from('accounting_bills')
    .select('id, bill_reference, vendor_name, category, total, vat_amount, currency, status, payment_date, issue_date, is_simple, created_at')
    .neq('status', 'void')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, input.limit ?? 20)))
  if (input.status) q = q.eq('status', input.status)
  if (input.category) q = q.eq('category', input.category)
  if (input.from_date) q = q.gte('issue_date', input.from_date)
  if (input.to_date) q = q.lte('issue_date', input.to_date)
  const fuzzy = input.q || input.vendor
  if (fuzzy) q = q.or(`vendor_name.ilike.%${fuzzy}%,bill_reference.ilike.%${fuzzy}%,bill_number.ilike.%${fuzzy}%`)
  const { data, error } = await q
  if (error) throw new Error(`find bills failed: ${error.message}`)
  return { count: data.length, rows: data }
}

async function approveBillTool(input) {
  const id = await _resolveBillId(input.id)
  if (!id) throw new Error(`bill not found: ${input.id}`)

  // Teach the categorizer the (vendor → category) mapping on approval.
  const { data: bill } = await supabase
    .from('accounting_bills')
    .select('vendor_name, category, qoyod_expense_account_id')
    .eq('id', id).maybeSingle()
  if (bill?.vendor_name && bill.category) {
    await _rememberBillCategory(bill.vendor_name, bill.category, bill.qoyod_expense_account_id)
  }

  const { data, error } = await supabase
    .from('accounting_bills')
    .update({ status: 'approved', approved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'draft')
    .select('bill_reference')
    .single()
  if (error) throw new Error(`approve failed: ${error.message}`)
  if (!data) throw new Error('Bill is not in draft status (already approved/pushed/void).')
  await revalidate(['/accounting/bills', `/accounting/bills/${id}`])
  return { approved: true, bill_reference: data.bill_reference, id }
}

async function _ensureQoyodVendor(apiKey, bill) {
  if (bill.qoyod_vendor_id) return bill.qoyod_vendor_id
  const fp = _vendorFingerprint(bill.vendor_name)
  if (!fp) return null

  const { data: cached } = await supabase
    .from('qoyod_vendors').select('qoyod_vendor_id').eq('fingerprint', fp).maybeSingle()
  if (cached?.qoyod_vendor_id) {
    await supabase.from('accounting_bills')
      .update({ qoyod_vendor_id: cached.qoyod_vendor_id }).eq('id', bill.id).catch(() => null)
    return cached.qoyod_vendor_id
  }

  const r = await _qoyodRequest(apiKey, 'POST', '/vendors', {
    vendor: {
      name: bill.vendor_name,
      vat_number: bill.vendor_vat || undefined,
      cr_number: bill.vendor_cr || undefined,
      address: bill.vendor_address || undefined,
    },
  })
  const vid = r?.vendor?.id
  if (vid) {
    await supabase.from('qoyod_vendors').insert({
      fingerprint: fp, vendor_name: bill.vendor_name, qoyod_vendor_id: vid,
    }).catch(() => null)
    await supabase.from('accounting_bills').update({ qoyod_vendor_id: vid }).eq('id', bill.id).catch(() => null)
  }
  return vid
}

async function pushBillTool(input) {
  const id = await _resolveBillId(input.id)
  if (!id) throw new Error(`bill not found: ${input.id}`)

  const { data: bill } = await supabase
    .from('accounting_bills').select('*').eq('id', id).maybeSingle()
  if (!bill) throw new Error('bill not found')
  if (bill.status !== 'approved') {
    throw new Error(`Bill must be approved first (currently: ${bill.status}).`)
  }

  const { data: settings } = await supabase
    .from('agency_settings')
    .select('qoyod_api_key, qoyod_default_inventory_id, qoyod_default_payment_account')
    .eq('id', 'default').maybeSingle()
  const apiKey = settings?.qoyod_api_key

  if (!apiKey) {
    await supabase.from('accounting_bills').update({ push_error: 'Qoyod API key not configured.' }).eq('id', id)
    throw new Error('Qoyod API key not set. Open the dashboard → Settings → Accounting (قيود) and paste the API key. Then retry push.')
  }

  try {
    const vendor_id = await _ensureQoyodVendor(apiKey, bill)
    if (!vendor_id) throw new Error('Cannot resolve Qoyod vendor — bill has no vendor_name.')

    let externalId
    const issue_date = bill.issue_date

    if (bill.is_simple) {
      const expense_account = bill.qoyod_expense_account_id
      if (!expense_account) {
        throw new Error('Simple bill needs qoyod_expense_account_id — set the category or paste an account id on the bill before pushing.')
      }
      const created = await _qoyodRequest(apiKey, 'POST', '/simple_bills', {
        simple_bill: {
          vendor_id,
          reference: bill.bill_reference,
          description: bill.notes || undefined,
          issue_date,
          due_date: bill.due_date || issue_date,
          amount: Number(bill.total ?? 0),
          expense_account_id: expense_account,
          tax_percent: Number(bill.vat_rate ?? 15),
        },
      })
      externalId = created?.simple_bill?.id
    } else {
      const vat_rate = Number(bill.vat_rate ?? 15)
      const lines = Array.isArray(bill.line_items) ? bill.line_items : []
      if (lines.length === 0) throw new Error('Bill has no line items.')
      const qoyodLines = lines.map((l) => ({
        description: l.description || 'Expense',
        quantity: Number(l.qty ?? 1),
        unit_price: Number(l.unit_price ?? 0),
        tax_percent: Number(l.vat_rate ?? vat_rate),
        account_id: bill.qoyod_expense_account_id ?? undefined,
      }))
      const created = await _qoyodRequest(apiKey, 'POST', '/bills', {
        bill: {
          vendor_id,
          reference: bill.bill_reference,
          description: bill.notes || undefined,
          issue_date,
          due_date: bill.due_date || issue_date,
          status: 'Approved',
          inventory_id: settings?.qoyod_default_inventory_id ?? undefined,
          line_items: qoyodLines,
        },
      })
      externalId = created?.bill?.id
    }

    // Optional bill_payment record when the receipt already shows it was paid.
    if (bill.payment_date && settings?.qoyod_default_payment_account) {
      try {
        await _qoyodRequest(apiKey, 'POST', '/bill_payments', {
          bill_payment: {
            bill_id: externalId,
            account_id: settings.qoyod_default_payment_account,
            date: bill.payment_date,
            amount: String(bill.total ?? 0),
            reference: bill.payment_reference || `pay-${externalId}`,
          },
        })
      } catch (payErr) {
        console.warn('[qoyod] bill payment record failed:', payErr?.message)
      }
    }

    const externalUrl = `https://www.qoyod.com/${bill.is_simple ? 'simple_bills' : 'bills'}/${externalId}`
    await supabase.from('accounting_bills').update({
      status: bill.payment_date ? 'paid' : 'pushed',
      external_system: 'qoyod',
      external_id: String(externalId),
      external_url: externalUrl,
      external_pushed_at: new Date().toISOString(),
      push_error: null,
    }).eq('id', id)

    await revalidate(['/accounting/bills', `/accounting/bills/${id}`])
    return {
      pushed: true,
      bill_reference: bill.bill_reference,
      qoyod_bill_id: externalId,
      qoyod_url: externalUrl,
      paid: !!bill.payment_date,
    }
  } catch (err) {
    const msg = err?.message ?? 'unknown error'
    await supabase.from('accounting_bills').update({
      status: 'failed', push_error: msg,
    }).eq('id', id)
    throw new Error(msg)
  }
}

// =============================================================================
// HR — leave + attendance + payroll + EOSB + onboarding + CV intake + letters
// + documents. F1–F13.
// =============================================================================

// Resolve the team_member row for whoever DM'd the agent. JID looks like
// "<digits>@s.whatsapp.net" or "<lid>@lid". The team_members.whatsapp column
// is a free-form phone string — strip non-digits and try a prefix/suffix
// match.
// Cache the agency admin's JID(s) on agency_settings.admin_whatsapp_jids
// (comma-separated). Anyone else DM'ing the bot is treated as a regular
// employee — they can self-serve queries / submit requests, but cannot
// approve/reject/destructively act on anyone else's data.
async function _isAdminSender(ctxOverride = null) {
  const ctx = ctxOverride ?? getRequest()
  if (!ctx) return false

  // Fast path: src/index.js already classified the sender into senderRole.
  // Trust that — it's done once at message receipt, cached for the whole
  // tool-loop turn.
  if (ctx.senderRole === 'admin') return true
  if (ctx.senderRole === 'employee' || ctx.senderRole === 'public') return false

  // Fallback (legacy callers that don't pass senderRole — should be rare):
  if (!ctx.senderJid) return false
  const envAdmins = String(process.env.NOTIFY_JIDS || process.env.ADMIN_JIDS || '')
    .split(',').map((s) => s.trim()).filter(Boolean)
  if (envAdmins.includes(ctx.senderJid)) return true
  const digits = String(ctx.senderJid).split('@')[0].replace(/\D/g, '')
  if (!digits) return false
  const tail = digits.slice(-9)
  for (const j of envAdmins) {
    const jd = j.split('@')[0].replace(/\D/g, '')
    if (jd && (jd.endsWith(tail) || tail.endsWith(jd.slice(-9)))) return true
  }
  const { data: emp } = await supabase
    .from('team_members').select('id, role, whatsapp, phone, status').eq('status', 'active')
  for (const e of (emp ?? [])) {
    if (e.role !== 'admin') continue
    const wa = String(e.whatsapp || '').replace(/\D/g, '')
    const ph = String(e.phone || '').replace(/\D/g, '')
    if ((wa && wa.endsWith(tail)) || (ph && ph.endsWith(tail))) return true
  }
  return false
}

// Helper for "employee-or-admin" gate. Public users can NOT call HR self-service
// tools that touch real employee data (my_payroll, my_documents, etc.) because
// they aren't in team_members. Public users can use the agent for general
// questions only — see the public-tier prompt section.
async function _requireEmployeeOrAdmin() {
  const ctx = getRequest()
  if (ctx?.senderRole === 'admin' || ctx?.senderRole === 'employee') return
  throw new Error("Sorry — I can't share that here. Reach out at info@emergize-sa.com and someone from the team will help.")
}

// Throw if caller isn't admin. Use at the top of any destructive HR tool that
// could affect a different employee than the caller (approve_leave,
// mark_payroll_paid, draft_hr_letter, etc.).
async function _requireAdmin() {
  const ok = await _isAdminSender()
  if (!ok) throw new Error('Admin only. Ask your manager to do this — only admins can run this action.')
}

async function _resolveEmployeeFromSender(ctxOverride = null) {
  const ctx = ctxOverride ?? getRequest()
  if (!ctx?.senderJid) return null
  const digits = String(ctx.senderJid).split('@')[0].replace(/\D/g, '')
  if (!digits) return null

  // Try exact, then suffix (last 9 digits is enough to be unique in KSA).
  const tail = digits.slice(-9)
  const { data } = await supabase
    .from('team_members')
    .select('id, full_name, role, job_title, status, whatsapp, phone, base_salary, salary_currency, employment_type, gosi_subject, hire_date, annual_leave_balance')
    .eq('status', 'active')
  for (const e of (data ?? [])) {
    const wa = String(e.whatsapp || '').replace(/\D/g, '')
    const ph = String(e.phone || '').replace(/\D/g, '')
    if (wa && (wa.endsWith(tail) || tail.endsWith(wa.slice(-9)))) return e
    if (ph && (ph.endsWith(tail) || tail.endsWith(ph.slice(-9)))) return e
  }
  return null
}

async function _resolveEmployeeIdByNameOrId(input) {
  if (input.employee_id) return input.employee_id
  if (input.employee_name) {
    const id = await findOneTeamMemberIdByName(input.employee_name)
    return id ?? null
  }
  return null
}

function _daysBetween(a, b) {
  const ad = new Date(a + 'T00:00:00Z').getTime()
  const bd = new Date(b + 'T00:00:00Z').getTime()
  if (Number.isNaN(ad) || Number.isNaN(bd)) return 0
  return Math.floor((bd - ad) / 86_400_000) + 1
}

// ---- F2 + F3: leave + conflict detector --------------------------------------

async function _checkLeaveConflicts(start_date, end_date, employee_id) {
  // 1. Other team members on leave overlapping
  const { data: overlap } = await supabase
    .from('leave_requests')
    .select('id, employee_id, type, start_date, end_date, status, team_members:employee_id (full_name)')
    .in('status', ['approved', 'pending'])
    .lte('start_date', end_date)
    .gte('end_date', start_date)
  const overlapping = (overlap ?? [])
    .filter((r) => r.employee_id !== employee_id)
    .map((r) => ({
      employee_id: r.employee_id,
      employee_name: r.team_members?.full_name ?? '—',
      type: r.type,
      start_date: r.start_date,
      end_date: r.end_date,
      status: r.status,
    }))

  // 2. Tasks due in the window assigned to this employee
  let tasksDue = []
  if (employee_id) {
    const { data: tasks } = await supabase
      .from('tasks')
      .select('id, title, due_date, status, priority, clients:client_id (company_name)')
      .eq('assignee_id', employee_id)
      .gte('due_date', start_date)
      .lte('due_date', end_date)
      .neq('status', 'completed')
    tasksDue = (tasks ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      due_date: t.due_date,
      status: t.status,
      priority: t.priority,
      client: t.clients?.company_name ?? null,
    }))
  }

  // 3. Weekly reports the employee is on the hook for, due in window
  let reportsDue = []
  if (employee_id) {
    try {
      const { data: reps } = await supabase
        .from('weekly_reports')
        .select('id, period_start, period_end, customer_company, assignee_id')
        .eq('assignee_id', employee_id)
        .gte('period_end', start_date)
        .lte('period_end', end_date)
      reportsDue = (reps ?? []).map((r) => ({
        id: r.id, customer: r.customer_company, period_end: r.period_end,
      }))
    } catch {
      // weekly_reports.assignee_id may not exist on every project — silently skip
    }
  }

  // Score
  let level = 'low'
  if (tasksDue.some((t) => t.priority === 'urgent' || t.priority === 'high')) level = 'high'
  else if (tasksDue.length > 0 || reportsDue.length > 0) level = 'medium'
  if (overlapping.filter((o) => o.status === 'approved').length >= 2) {
    level = level === 'high' ? 'high' : 'medium'
  }

  return { level, overlapping, tasksDue, reportsDue }
}

async function requestLeaveForSelfTool(input) {
  let employee = null
  let employeeId = input.override_employee_id ?? null
  if (employeeId) {
    const { data } = await supabase
      .from('team_members').select('id, full_name, whatsapp, base_salary, annual_leave_balance')
      .eq('id', employeeId).maybeSingle()
    employee = data ?? null
  } else {
    employee = await _resolveEmployeeFromSender()
    if (employee) employeeId = employee.id
  }
  if (!employee) {
    throw new Error("Couldn't resolve which team member you are. The admin needs to add your WhatsApp number to your team_members row first.")
  }

  const start = String(input.start_date)
  const end = String(input.end_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('start_date and end_date must be ISO YYYY-MM-DD.')
  }
  const days = _daysBetween(start, end)
  if (days < 1) throw new Error('end_date must be on or after start_date.')

  const type = input.type || 'annual'
  const balance = Number(employee.annual_leave_balance ?? 21)
  let balanceWarning = ''
  if (type === 'annual' && days > balance) {
    balanceWarning = `\n⚠ Requested ${days} days but annual balance is only ${balance}. ${days - balance} day(s) would need to be unpaid.`
  }

  const { data: leave, error } = await supabase
    .from('leave_requests')
    .insert({
      employee_id: employeeId,
      type, start_date: start, end_date: end, days,
      status: 'pending',
      reason: input.reason ?? null,
    })
    .select('id').single()
  if (error) throw new Error(`Create leave request failed: ${error.message}`)

  // Conflict summary
  const conflict = await _checkLeaveConflicts(start, end, employeeId)

  // Build admin DM
  const overlapBlock = conflict.overlapping.length
    ? conflict.overlapping.map((o) => `   • ${o.employee_name} (${o.type}, ${o.start_date}→${o.end_date}, ${o.status})`).join('\n')
    : '   None'
  const tasksBlock = conflict.tasksDue.length
    ? conflict.tasksDue.map((t) => `   • ${t.priority?.toUpperCase() ?? '—'}: "${t.title}" due ${t.due_date}${t.client ? ` (${t.client})` : ''}`).join('\n')
    : '   None in window'
  const reportsBlock = conflict.reportsDue.length
    ? conflict.reportsDue.map((r) => `   • ${r.customer} weekly report period_end ${r.period_end}`).join('\n')
    : '   None'
  const riskEmoji = conflict.level === 'high' ? '🚨' : conflict.level === 'medium' ? '⚠️' : 'ℹ️'

  const adminText =
    `🏖 NEW LEAVE REQUEST\n\n` +
    `Employee: ${employee.full_name}\n` +
    `Type: ${type}\n` +
    `Dates: ${start} → ${end} (${days} day${days === 1 ? '' : 's'})\n` +
    `Reason: ${input.reason || '—'}\n` +
    `Annual balance: ${balance} days${balanceWarning}\n\n` +
    `${riskEmoji} Conflict risk: ${conflict.level.toUpperCase()}\n\n` +
    `Others on leave that week:\n${overlapBlock}\n\n` +
    `${employee.full_name}'s tasks due in window:\n${tasksBlock}\n\n` +
    `Weekly reports due:\n${reportsBlock}\n\n` +
    `Reply "approve ${leave.id.slice(0,8)}" or "reject ${leave.id.slice(0,8)} <reason>" to act.`

  // Drop a notification (the dashboard bell) — agent will broadcast over WA
  // separately when admin DMs the bot. Here we use the existing notifications
  // pipeline so the dashboard view also shows it.
  await supabase.from('notifications').insert({
    user_id: null,
    title: `Leave request: ${employee.full_name}`,
    message: adminText.slice(0, 800),
    type: 'leave_pending_review',
    related_id: leave.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr', '/notifications'])
  return {
    leave_id: leave.id,
    employee_name: employee.full_name,
    days, type, start, end,
    conflict_level: conflict.level,
    conflicts_overlapping: conflict.overlapping.length,
    conflicts_tasks: conflict.tasksDue.length,
    admin_card: adminText,
  }
}

async function findLeaveRequestsTool(input) {
  let q = supabase.from('leave_requests')
    .select('id, employee_id, type, start_date, end_date, days, status, reason, decision_note, created_at, team_members:employee_id (full_name)')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, input.limit ?? 10)))
  if (input.status) q = q.eq('status', input.status)
  if (input.employee_id) q = q.eq('employee_id', input.employee_id)
  if (input.from_date) q = q.gte('start_date', input.from_date)
  if (input.to_date) q = q.lte('end_date', input.to_date)
  if (input.employee_name) {
    const id = await findOneTeamMemberIdByName(input.employee_name)
    if (id) q = q.eq('employee_id', id)
  }
  const { data, error } = await q
  if (error) throw new Error(`find leave requests failed: ${error.message}`)
  return {
    count: data.length,
    rows: data.map((r) => ({ ...r, employee_name: r.team_members?.full_name })),
  }
}

async function approveLeaveTool(input) {
  await _requireAdmin()
  const { data: leave } = await supabase
    .from('leave_requests')
    .select('id, employee_id, type, days, status')
    .eq('id', input.id).maybeSingle()
  if (!leave) throw new Error('leave_requests row not found')
  if (leave.status !== 'pending') throw new Error(`Cannot approve — current status is ${leave.status}.`)

  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString(), decision_note: input.decision_note ?? null })
    .eq('id', input.id).eq('status', 'pending')
  if (error) throw new Error(`approve failed: ${error.message}`)

  // Decrement annual_leave_balance only for type='annual'
  if (leave.type === 'annual') {
    const { data: emp } = await supabase
      .from('team_members').select('annual_leave_balance').eq('id', leave.employee_id).maybeSingle()
    const current = Number(emp?.annual_leave_balance ?? 21)
    await supabase.from('team_members')
      .update({ annual_leave_balance: Math.max(0, current - Number(leave.days ?? 0)) })
      .eq('id', leave.employee_id)
      .catch(() => null)
  }
  await revalidate(['/hr'])
  return { approved: true, id: input.id }
}

async function rejectLeaveTool(input) {
  await _requireAdmin()
  if (!input.decision_note) throw new Error('decision_note is required.')
  const { error } = await supabase
    .from('leave_requests')
    .update({ status: 'rejected', decided_at: new Date().toISOString(), decision_note: input.decision_note })
    .eq('id', input.id).eq('status', 'pending')
  if (error) throw new Error(`reject failed: ${error.message}`)
  await revalidate(['/hr'])
  return { rejected: true, id: input.id }
}

async function checkLeaveConflictsTool(input) {
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  return await _checkLeaveConflicts(input.start_date, input.end_date, empId)
}

// ---- F4 + F5: payroll + EOSB --------------------------------------------------

function _eosbForYears(monthly_salary, yearsServed) {
  if (yearsServed <= 0 || !monthly_salary) return 0
  if (yearsServed <= 5) return monthly_salary * 0.5 * yearsServed
  return monthly_salary * 0.5 * 5 + monthly_salary * 1.0 * (yearsServed - 5)
}

async function _eosbForEmployee(employee, asOfIso) {
  const hire = employee.hire_date ? new Date(employee.hire_date + 'T00:00:00Z').getTime() : null
  const asOf = new Date(asOfIso + 'T00:00:00Z').getTime()
  if (!hire || asOf <= hire) return { years_served: 0, monthly_salary: Number(employee.base_salary ?? 0), accrued: 0 }
  const yearsServed = (asOf - hire) / (365.25 * 86_400_000)
  const monthly_salary = Number(employee.base_salary ?? 0)
  const accrued = _eosbForYears(monthly_salary, yearsServed)
  return { years_served: yearsServed, monthly_salary, accrued }
}

async function computeEosbTool(input) {
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  if (!empId) throw new Error('Specify employee_id or employee_name.')

  const { data: emp } = await supabase
    .from('team_members')
    .select('id, full_name, base_salary, salary_currency, hire_date')
    .eq('id', empId).maybeSingle()
  if (!emp) throw new Error('employee not found')

  const asOf = input.as_of_date || new Date().toISOString().slice(0, 10)
  const { years_served, monthly_salary, accrued } = await _eosbForEmployee(emp, asOf)
  const round = Math.round(accrued * 100) / 100
  await supabase.from('eosb_snapshots').upsert({
    employee_id: empId,
    as_of_date: asOf,
    years_served: Math.round(years_served * 1000) / 1000,
    monthly_salary,
    accrued_amount: round,
    currency: emp.salary_currency || 'SAR',
  }, { onConflict: 'employee_id,as_of_date' }).catch(() => null)
  await revalidate(['/hr/eosb'])
  return {
    employee_id: empId,
    employee_name: emp.full_name,
    as_of_date: asOf,
    years_served: Math.round(years_served * 100) / 100,
    monthly_salary,
    accrued: round,
    currency: emp.salary_currency || 'SAR',
  }
}

async function generatePayrollTool(input) {
  await _requireAdmin()
  const year = Number(input.year)
  const month = Number(input.month)
  if (!year || !month || month < 1 || month > 12) throw new Error('Pass valid year + month.')

  // Period bounds for prorating unpaid leave
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const { data: emps } = await supabase
    .from('team_members')
    .select('id, full_name, base_salary, salary_currency, housing_allowance, transport_allowance, other_allowances, gosi_subject, employment_type, hire_date, status')
    .eq('status', 'active')

  const generated = []
  for (const e of (emps ?? [])) {
    const baseSalary = Number(e.base_salary ?? 0)
    if (!baseSalary) continue

    const housing   = Number(e.housing_allowance ?? 0)
    const transport = Number(e.transport_allowance ?? 0)
    const other     = Number(e.other_allowances ?? 0)
    const gross     = baseSalary + housing + transport + other

    // Skip if a paid row already exists — don't clobber.
    const { data: existing } = await supabase
      .from('payroll_records')
      .select('id, status')
      .eq('employee_id', e.id).eq('period_year', year).eq('period_month', month)
      .maybeSingle()
    if (existing && existing.status === 'paid') {
      continue
    }

    // GOSI: KSA Saudi nationals → 9% employee share. Expats → no employee GOSI
    // (only employer pays 2%), so we record it as 0 for the employee row.
    const gosiPct = e.gosi_subject === 'saudi' ? 0.09 : 0
    const gosi = Math.round(baseSalary * gosiPct * 100) / 100

    // Unpaid leave subtraction — count approved unpaid days that overlap the period
    const { data: unpaid } = await supabase
      .from('leave_requests')
      .select('start_date, end_date, days, type, status')
      .eq('employee_id', e.id).eq('type', 'unpaid').eq('status', 'approved')
      .lte('start_date', periodEnd).gte('end_date', periodStart)
    let unpaidDays = 0
    for (const u of (unpaid ?? [])) {
      const from = u.start_date < periodStart ? periodStart : u.start_date
      const to   = u.end_date   > periodEnd   ? periodEnd   : u.end_date
      unpaidDays += _daysBetween(from, to)
    }
    const dailyRate = gross / 30 // KSA convention: 30-day month
    const unpaidDeduction = Math.round(unpaidDays * dailyRate * 100) / 100

    // EOSB accrual (informational only — not deducted from net)
    const eosb = await _eosbForEmployee(e, periodEnd)
    const monthlyEosbAccrual = Math.round(((eosb.years_served > 5 ? baseSalary / 12 : baseSalary / 24)) * 100) / 100

    const deductions = gosi + unpaidDeduction
    const bonus = 0
    const net = gross + bonus - deductions

    // Upsert row + replace line items
    const upsertRow = {
      employee_id: e.id, period_year: year, period_month: month,
      gross_amount: gross, deductions, bonus, status: 'pending',
      currency: e.salary_currency || 'SAR',
    }
    const { data: prow, error: pErr } = await supabase
      .from('payroll_records')
      .upsert(upsertRow, { onConflict: 'employee_id,period_year,period_month' })
      .select('id').single()
    if (pErr) throw new Error(`payroll upsert failed: ${pErr.message}`)

    // Clear + reinsert lines
    await supabase.from('payroll_line_items').delete().eq('payroll_id', prow.id)
    const lines = [
      { kind: 'base',      label: 'Base salary',           label_ar: 'الراتب الأساسي',         amount: baseSalary, is_deduction: false, position: 0 },
    ]
    if (housing)   lines.push({ kind: 'housing',   label: 'Housing allowance',       label_ar: 'بدل سكن',           amount: housing,   is_deduction: false, position: 1 })
    if (transport) lines.push({ kind: 'transport', label: 'Transport allowance',     label_ar: 'بدل نقل',           amount: transport, is_deduction: false, position: 2 })
    if (other)     lines.push({ kind: 'allowance', label: 'Other allowances',        label_ar: 'بدلات أخرى',        amount: other,     is_deduction: false, position: 3 })
    if (gosi)      lines.push({ kind: 'gosi_employee', label: 'GOSI (9% employee)',  label_ar: 'تأمينات اجتماعية', amount: gosi,      is_deduction: true,  position: 4 })
    if (unpaidDeduction) lines.push({ kind: 'unpaid_leave', label: `Unpaid leave (${unpaidDays}d)`, label_ar: `إجازة بدون راتب (${unpaidDays} يوم)`, amount: unpaidDeduction, is_deduction: true, position: 5 })
    lines.push({ kind: 'eosb_accrual', label: 'EOSB accrual (informational)', label_ar: 'مخصص نهاية الخدمة (للعلم)', amount: monthlyEosbAccrual, is_deduction: false, position: 9, meta: { informational: true } })

    const linesToInsert = lines.map((l) => ({ ...l, payroll_id: prow.id }))
    await supabase.from('payroll_line_items').insert(linesToInsert)
    generated.push({ employee_id: e.id, name: e.full_name, gross, deductions, net })
  }

  await revalidate(['/hr'])
  return {
    period: `${year}-${String(month).padStart(2, '0')}`,
    generated: generated.length,
    rows: generated,
  }
}

async function markPayrollPaidTool(input) {
  await _requireAdmin()
  const paidDate = input.paid_date || new Date().toISOString().slice(0, 10)
  const { data: row, error } = await supabase
    .from('payroll_records')
    .update({ status: 'paid', paid_date: paidDate, method: input.method ?? null, notes: input.notes ?? null })
    .eq('id', input.payroll_id).eq('status', 'pending')
    .select('id, employee_id, period_year, period_month').single()
  if (error) throw new Error(`mark paid failed: ${error.message}`)
  if (!row) throw new Error('No pending payroll row with that id.')

  let slipResult = null
  if (input.send_slip !== false) {
    try { slipResult = await sendSalarySlipTool({ payroll_id: input.payroll_id, channel: 'both' }) }
    catch (e) { slipResult = { error: e?.message ?? 'slip send failed' } }
  }
  await revalidate(['/hr'])
  return { paid: true, id: input.payroll_id, slip: slipResult }
}

async function findPayrollTool(input) {
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  let q = supabase.from('payroll_records')
    .select('id, employee_id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method, team_members:employee_id (full_name)')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })
    .limit(50)
  if (empId) q = q.eq('employee_id', empId)
  if (input.year) q = q.eq('period_year', input.year)
  if (input.month) q = q.eq('period_month', input.month)
  if (input.status) q = q.eq('status', input.status)
  const { data, error } = await q
  if (error) throw new Error(`find payroll failed: ${error.message}`)
  return {
    count: data.length,
    rows: data.map((r) => ({ ...r, employee_name: r.team_members?.full_name })),
  }
}

// ---- F6: salary slip ---------------------------------------------------------

async function sendSalarySlipTool(input) {
  const { data: pay } = await supabase
    .from('payroll_records')
    .select('id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method, team_members:employee_id (id, full_name, full_name_ar, job_title, job_title_ar, email, whatsapp, phone, bank_iban)')
    .eq('id', input.payroll_id).maybeSingle()
  if (!pay) throw new Error('payroll row not found')

  const emp = pay.team_members
  if (!emp) throw new Error('linked employee row missing')

  // Pull line items for the breakdown table
  const { data: lines } = await supabase
    .from('payroll_line_items')
    .select('label, label_ar, amount, is_deduction, kind, meta')
    .eq('payroll_id', input.payroll_id)
    .order('position')

  const period = `${pay.period_year}-${String(pay.period_month).padStart(2, '0')}`
  const monthName = new Date(Date.UTC(pay.period_year, pay.period_month - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const monthNameAr = new Date(Date.UTC(pay.period_year, pay.period_month - 1, 1)).toLocaleDateString('ar-SA-u-nu-latn', { month: 'long', year: 'numeric', timeZone: 'UTC' })

  // Render HTML
  const sigLines = (lines ?? []).map((l) => `
      <tr>
        <td style="padding:6px 8px;border-top:1px solid #eee;text-align:left;">${escapeHtmlLocal(l.label)}</td>
        <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;direction:rtl;">${escapeHtmlLocal(l.label_ar || '')}</td>
        <td style="padding:6px 8px;border-top:1px solid #eee;text-align:right;color:${l.is_deduction ? '#b91c1c' : '#16a34a'};">
          ${l.is_deduction ? '−' : ''}${Number(l.amount).toLocaleString('en-US')}
        </td>
      </tr>
  `).join('')

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Salary Slip ${period}</title></head><body style="font-family:Inter,Arial,sans-serif;background:#f8fafc;padding:24px;color:#0f172a">
    <div style="max-width:640px;margin:auto;background:white;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="background:#000;color:#bef264;padding:18px 24px;display:flex;justify-content:space-between;align-items:center;">
        <div style="font-weight:900;font-size:22px;letter-spacing:-0.5px;">Emergize</div>
        <div style="font-size:11px;font-weight:bold;opacity:.85;">SALARY SLIP · إيصال راتب</div>
      </div>
      <div style="padding:24px;">
        <table style="width:100%;font-size:13px;line-height:1.55;">
          <tr>
            <td style="padding:4px 0;color:#64748b;">Employee · الموظف</td>
            <td style="padding:4px 0;text-align:right;font-weight:bold;">${escapeHtmlLocal(emp.full_name || '')} ${emp.full_name_ar ? `<span style="font-weight:normal;color:#64748b">· ${escapeHtmlLocal(emp.full_name_ar)}</span>` : ''}</td>
          </tr>
          ${emp.job_title ? `<tr><td style="padding:4px 0;color:#64748b;">Job title · المسمى</td><td style="padding:4px 0;text-align:right;">${escapeHtmlLocal(emp.job_title)} ${emp.job_title_ar ? `<span style="color:#64748b">· ${escapeHtmlLocal(emp.job_title_ar)}</span>` : ''}</td></tr>` : ''}
          <tr><td style="padding:4px 0;color:#64748b;">Period · الفترة</td><td style="padding:4px 0;text-align:right;">${escapeHtmlLocal(monthName)} <span style="color:#64748b">· ${escapeHtmlLocal(monthNameAr)}</span></td></tr>
          ${pay.paid_date ? `<tr><td style="padding:4px 0;color:#64748b;">Paid on · تاريخ الصرف</td><td style="padding:4px 0;text-align:right;">${pay.paid_date}</td></tr>` : ''}
          ${pay.method ? `<tr><td style="padding:4px 0;color:#64748b;">Method · طريقة الصرف</td><td style="padding:4px 0;text-align:right;">${escapeHtmlLocal(pay.method)}</td></tr>` : ''}
          ${emp.bank_iban ? `<tr><td style="padding:4px 0;color:#64748b;">IBAN</td><td style="padding:4px 0;text-align:right;font-family:monospace;">${escapeHtmlLocal(emp.bank_iban)}</td></tr>` : ''}
        </table>
        <h3 style="margin:20px 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#64748b;">Breakdown · التفاصيل</h3>
        <table style="width:100%;font-size:13px;border-collapse:collapse;">
          <thead><tr style="background:#f1f5f9;font-weight:bold;font-size:11px;text-transform:uppercase;letter-spacing:.5px;">
            <th style="padding:8px;text-align:left;">Item</th><th style="padding:8px;text-align:right;">البند</th><th style="padding:8px;text-align:right;">${escapeHtmlLocal(pay.currency || 'SAR')}</th>
          </tr></thead>
          <tbody>${sigLines}</tbody>
        </table>
        <div style="margin-top:18px;padding:12px 14px;background:#ecfdf5;border-left:4px solid #16a34a;border-radius:6px;display:flex;justify-content:space-between;font-weight:900;font-size:16px;">
          <span>Net pay · صافي الراتب</span>
          <span>${Number(pay.net_amount ?? 0).toLocaleString('en-US')} ${pay.currency || 'SAR'}</span>
        </div>
        <p style="margin-top:18px;font-size:11px;color:#64748b;line-height:1.5;">Auto-generated by Emergize HR. Questions about this slip? Reply to this message or email info@emergize-sa.com.</p>
      </div>
    </div>
  </body></html>`

  // Upload as a generic PDF — we don't have a Chrome renderer wired here,
  // so emit an HTML email instead of a PDF for now. The dashboard can later
  // generate a real PDF via /api/hr/salary-slip if a Chrome runtime is wired.
  const subject = `Salary slip · ${monthName} · ${Number(pay.net_amount ?? 0).toLocaleString('en-US')} ${pay.currency || 'SAR'}`
  let emailRes = null, waRes = null
  const channel = input.channel || 'both'

  if ((channel === 'email' || channel === 'both') && emp.email) {
    try {
      emailRes = await sendEmail({ to: emp.email, subject, text: `Your salary slip for ${monthName} is attached below.`, html, client_id: null })
    } catch (err) { emailRes = { sent: false, error: err?.message } }
  }
  if ((channel === 'whatsapp' || channel === 'both') && (emp.whatsapp || emp.phone)) {
    try {
      const text =
        `💰 *Salary slip — ${monthName}*\n\n` +
        `Net: *${Number(pay.net_amount ?? 0).toLocaleString('en-US')} ${pay.currency || 'SAR'}*\n` +
        `Gross: ${Number(pay.gross_amount ?? 0).toLocaleString('en-US')} ${pay.currency || 'SAR'}\n` +
        `Deductions: ${Number(pay.deductions ?? 0).toLocaleString('en-US')} ${pay.currency || 'SAR'}\n` +
        (pay.paid_date ? `Paid: ${pay.paid_date}\n` : '') +
        `\nFull breakdown sent to your email.`
      waRes = await sendWhatsappMessage({ to_phone: emp.whatsapp || emp.phone, text, client_id: null })
    } catch (err) { waRes = { sent: false, error: err?.message } }
  }

  await supabase.from('payroll_records').update({
    slip_sent_at: new Date().toISOString(),
    slip_channel: channel,
  }).eq('id', input.payroll_id).catch(() => null)

  return {
    payroll_id: input.payroll_id, channel,
    email_sent: emailRes?.sent === true,
    whatsapp_sent: waRes?.sent === true,
    email_error: emailRes?.error,
    whatsapp_error: waRes?.error,
  }
}

function escapeHtmlLocal(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---- F7: onboarding ----------------------------------------------------------

const ONBOARDING_TEMPLATES = {
  saudi_full_time: [
    { title: 'Sign employment contract',       title_ar: 'توقيع عقد العمل',                    category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect national_id copy',       title_ar: 'استلام نسخة الهوية الوطنية',         category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'GOSI registration',              title_ar: 'تسجيل التأمينات الاجتماعية (GOSI)',  category: 'compliance', owner_role: 'finance',  due_offset_days: 7 },
    { title: 'Collect bank IBAN form',         title_ar: 'استلام نموذج رقم الآيبان',           category: 'paperwork',  owner_role: 'finance',  due_offset_days: 3 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Sign NDA / IP agreement',        title_ar: 'توقيع اتفاقية السرية',               category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Equipment handover (laptop)',    title_ar: 'تسليم الأجهزة (لابتوب)',             category: 'orientation',owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى مجموعات واتساب وسلاك', category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Intro 1:1 with manager',         title_ar: 'لقاء تعريفي مع المدير',              category: 'orientation',owner_role: 'manager',  due_offset_days: 3 },
    { title: 'First-week training plan',       title_ar: 'خطة تدريب الأسبوع الأول',            category: 'orientation',owner_role: 'manager',  due_offset_days: 7 },
    { title: '30-day check-in',                title_ar: 'مراجعة بعد 30 يوم',                  category: 'orientation',owner_role: 'manager',  due_offset_days: 30 },
  ],
  expat_full_time: [
    { title: 'Sign employment contract',       title_ar: 'توقيع عقد العمل',                    category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect passport copy',          title_ar: 'استلام نسخة الجواز',                 category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Apply for / transfer iqama',     title_ar: 'إصدار / نقل الإقامة',                category: 'compliance', owner_role: 'admin',    due_offset_days: 14 },
    { title: 'Apply for visa stamping',        title_ar: 'إصدار تأشيرة العمل',                category: 'compliance', owner_role: 'admin',    due_offset_days: 21 },
    { title: 'GOSI registration (2% employer)',title_ar: 'تسجيل التأمينات (2% صاحب العمل)',    category: 'compliance', owner_role: 'finance',  due_offset_days: 7 },
    { title: 'Medical insurance enrollment',   title_ar: 'تسجيل التأمين الطبي',                category: 'compliance', owner_role: 'admin',    due_offset_days: 14 },
    { title: 'Collect bank IBAN form',         title_ar: 'استلام نموذج رقم الآيبان',           category: 'paperwork',  owner_role: 'finance',  due_offset_days: 3 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Sign NDA / IP agreement',        title_ar: 'توقيع اتفاقية السرية',               category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Equipment handover (laptop)',    title_ar: 'تسليم الأجهزة (لابتوب)',             category: 'orientation',owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى مجموعات واتساب وسلاك', category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Intro 1:1 with manager',         title_ar: 'لقاء تعريفي مع المدير',              category: 'orientation',owner_role: 'manager',  due_offset_days: 3 },
    { title: '30-day check-in',                title_ar: 'مراجعة بعد 30 يوم',                  category: 'orientation',owner_role: 'manager',  due_offset_days: 30 },
  ],
  part_time: [
    { title: 'Sign part-time contract',        title_ar: 'توقيع عقد جزئي',                     category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect ID copy',                title_ar: 'استلام نسخة الهوية',                category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Set up @emergize-sa.com email',  title_ar: 'إنشاء بريد العمل',                  category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى المجموعات',            category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Define working hours / schedule',title_ar: 'تحديد ساعات العمل',                 category: 'orientation',owner_role: 'manager',  due_offset_days: 2 },
  ],
  intern: [
    { title: 'Sign internship agreement',      title_ar: 'توقيع عقد التدريب',                 category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect ID copy',                title_ar: 'استلام نسخة الهوية',                category: 'paperwork',  owner_role: 'admin',    due_offset_days: 1 },
    { title: 'University coordination letter', title_ar: 'خطاب التنسيق مع الجامعة',           category: 'paperwork',  owner_role: 'admin',    due_offset_days: 7 },
    { title: 'Assign mentor',                  title_ar: 'تعيين موجِّه',                       category: 'orientation',owner_role: 'manager',  due_offset_days: 1 },
    { title: 'Set up dashboard access',        title_ar: 'إعداد صلاحيات النظام',              category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
    { title: 'Add to WhatsApp + Slack channels', title_ar: 'إضافته إلى المجموعات',            category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
  ],
  contractor: [
    { title: 'Sign contractor agreement',      title_ar: 'توقيع عقد المقاول',                 category: 'paperwork',  owner_role: 'employee', due_offset_days: 1 },
    { title: 'Collect CR / freelance license', title_ar: 'استلام السجل التجاري / رخصة العمل الحر', category: 'paperwork', owner_role: 'admin', due_offset_days: 3 },
    { title: 'Confirm payment terms + IBAN',   title_ar: 'تأكيد شروط الدفع والآيبان',          category: 'paperwork',  owner_role: 'finance',  due_offset_days: 1 },
    { title: 'Project scope brief',            title_ar: 'إيضاح نطاق المشروع',                 category: 'orientation',owner_role: 'manager',  due_offset_days: 1 },
    { title: 'Add to project WhatsApp group',  title_ar: 'إضافته إلى مجموعة المشروع',         category: 'access',     owner_role: 'admin',    due_offset_days: 1 },
  ],
}

async function startOnboardingTool(input) {
  await _requireAdmin()
  const { data: emp } = await supabase
    .from('team_members').select('id, full_name, employment_type, nationality, hire_date').eq('id', input.employee_id).maybeSingle()
  if (!emp) throw new Error('employee not found')

  let template = input.template
  if (!template) {
    const isSaudi = (emp.nationality || '').toLowerCase().includes('saudi') || (emp.nationality || '') === 'SA'
    const et = emp.employment_type || 'full_time'
    if (et === 'intern') template = 'intern'
    else if (et === 'contractor') template = 'contractor'
    else if (et === 'part_time') template = 'part_time'
    else template = isSaudi ? 'saudi_full_time' : 'expat_full_time'
  }
  if (!ONBOARDING_TEMPLATES[template]) throw new Error(`Unknown template: ${template}`)

  // Idempotent — one checklist per employee
  const { data: existing } = await supabase
    .from('onboarding_checklists').select('id').eq('employee_id', input.employee_id).maybeSingle()
  if (existing) {
    return { already_started: true, checklist_id: existing.id, template }
  }

  const { data: chk, error } = await supabase
    .from('onboarding_checklists')
    .insert({ employee_id: input.employee_id, template, status: 'in_progress' })
    .select('id').single()
  if (error) throw new Error(`onboarding create failed: ${error.message}`)

  const tpl = ONBOARDING_TEMPLATES[template]
  const items = tpl.map((it, idx) => ({
    checklist_id: chk.id,
    position: idx,
    title: it.title,
    title_ar: it.title_ar,
    category: it.category,
    owner_role: it.owner_role,
    due_offset_days: it.due_offset_days,
    done: false,
  }))
  await supabase.from('onboarding_checklist_items').insert(items)

  await revalidate(['/hr/onboarding', '/hr'])
  return { started: true, checklist_id: chk.id, template, items_count: items.length, employee_name: emp.full_name }
}

async function markOnboardingItemDoneTool(input) {
  const { error } = await supabase
    .from('onboarding_checklist_items')
    .update({ done: true, done_at: new Date().toISOString() })
    .eq('id', input.item_id)
  if (error) throw new Error(`mark item done failed: ${error.message}`)
  await revalidate(['/hr/onboarding'])
  return { done: true, item_id: input.item_id }
}

// ---- F8: performance brief ---------------------------------------------------

async function performanceBriefTool(input) {
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  if (!empId) throw new Error('Specify employee_id or employee_name.')

  const days = Math.max(7, Math.min(180, input.days ?? 30))
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  const { data: emp } = await supabase
    .from('team_members').select('id, full_name, job_title, hire_date').eq('id', empId).maybeSingle()
  if (!emp) throw new Error('employee not found')

  // Tasks closed
  const { data: tasksClosed } = await supabase
    .from('tasks').select('id, title, status, updated_at, clients:client_id (company_name)')
    .eq('assignee_id', empId).eq('status', 'completed').gte('updated_at', since)

  // Tasks still open
  const { data: tasksOpen } = await supabase
    .from('tasks').select('id, title, status, due_date, priority').eq('assignee_id', empId).neq('status', 'completed').limit(20)

  // Weekly reports authored
  let reports = []
  try {
    const r = await supabase.from('weekly_reports')
      .select('id, period_end, customer_company')
      .eq('assignee_id', empId).gte('period_end', since)
    reports = r.data ?? []
  } catch {/* assignee_id may not exist on this project */}

  // Content posted
  let content = []
  try {
    const c = await supabase.from('content_items')
      .select('id, title, platform, schedule_status, publish_date')
      .eq('assignee_id', empId).gte('publish_date', since)
    content = c.data ?? []
  } catch {/* */}

  // Leave taken
  const { data: leave } = await supabase.from('leave_requests')
    .select('start_date, end_date, days, type').eq('employee_id', empId).eq('status', 'approved')
    .gte('start_date', since)

  // Attendance lateness
  const { data: lateness } = await supabase.from('attendance_logs')
    .select('log_date, status, late_minutes').eq('employee_id', empId)
    .gte('log_date', since)
  const lateCount = (lateness ?? []).filter((a) => a.status === 'late').length
  const lateMinutes = (lateness ?? []).reduce((s, a) => s + (Number(a.late_minutes) || 0), 0)
  const wfhCount = (lateness ?? []).filter((a) => a.status === 'wfh').length

  const touchedClients = Array.from(new Set((tasksClosed ?? []).map((t) => t.clients?.company_name).filter(Boolean)))

  const brief =
    `*Performance brief — ${emp.full_name}*\n` +
    `Window: last ${days} days (${since} → ${today})\n\n` +
    `*Tasks closed:* ${(tasksClosed ?? []).length}\n` +
    ((tasksClosed ?? []).slice(0, 5).map((t) => `  • ${t.title}${t.clients?.company_name ? ` — ${t.clients.company_name}` : ''}`).join('\n') || '  (none)') + '\n\n' +
    `*Tasks still open:* ${(tasksOpen ?? []).length}\n` +
    ((tasksOpen ?? []).slice(0, 5).map((t) => `  • ${t.priority?.toUpperCase() ?? '—'} · ${t.title} (due ${t.due_date || '—'})`).join('\n') || '  (none)') + '\n\n' +
    `*Clients touched:* ${touchedClients.length ? touchedClients.join(', ') : '—'}\n` +
    `*Weekly reports authored:* ${reports.length}\n` +
    `*Content posted:* ${content.length}\n` +
    `*Leave taken:* ${(leave ?? []).reduce((s, l) => s + Number(l.days || 0), 0)} day(s) across ${(leave ?? []).length} request(s)\n` +
    `*Attendance:* ${lateCount} late days (${lateMinutes} min total), ${wfhCount} WFH days\n\n` +
    `Suggested 1:1 talking points:\n` +
    `  • Review the ${(tasksOpen ?? []).length} open tasks — any blocked?\n` +
    `  • Acknowledge wins from the ${(tasksClosed ?? []).length} closed tasks${touchedClients[0] ? ` (esp. ${touchedClients[0]} work)` : ''}\n` +
    `  • ${lateCount >= 3 ? '⚠ Discuss the lateness pattern (' + lateCount + ' late days)' : 'Check in on workload balance'}\n` +
    `  • Career growth: what does the next 90 days look like?`

  return {
    employee_id: empId,
    employee_name: emp.full_name,
    window_days: days,
    tasks_closed: (tasksClosed ?? []).length,
    tasks_open: (tasksOpen ?? []).length,
    clients_touched: touchedClients,
    reports_count: reports.length,
    content_count: content.length,
    leave_days: (leave ?? []).reduce((s, l) => s + Number(l.days || 0), 0),
    late_count: lateCount,
    late_minutes: lateMinutes,
    wfh_count: wfhCount,
    brief,
  }
}

// ---- F9: attendance ----------------------------------------------------------

async function logAttendanceTool(input) {
  let emp = null
  if (input.override_employee_id) {
    const { data } = await supabase.from('team_members').select('id, full_name').eq('id', input.override_employee_id).maybeSingle()
    emp = data
  } else {
    emp = await _resolveEmployeeFromSender()
  }
  if (!emp) throw new Error('Could not resolve employee. Add their WhatsApp to team_members or pass override_employee_id.')

  const action = input.action
  const log_date = input.log_date || new Date().toISOString().slice(0, 10)
  const now = new Date().toISOString()

  // Find or create row
  const { data: existing } = await supabase
    .from('attendance_logs').select('id, check_in_at, check_out_at, status, late_minutes')
    .eq('employee_id', emp.id).eq('log_date', log_date).maybeSingle()

  const patch = { source: 'whatsapp', notes: input.notes ?? null }
  if (action === 'check_in') {
    patch.check_in_at = now
    patch.status = 'present'
  } else if (action === 'check_out') {
    patch.check_out_at = now
    if (!existing?.check_in_at) patch.status = 'present'
  } else if (action === 'wfh') {
    patch.status = 'wfh'
    patch.check_in_at = now
  } else if (action === 'late') {
    patch.status = 'late'
    patch.late_minutes = Number(input.late_minutes ?? 0)
    patch.check_in_at = now
  } else if (action === 'absent') {
    patch.status = 'absent'
  }

  let row
  if (existing) {
    const { data, error } = await supabase.from('attendance_logs').update(patch).eq('id', existing.id).select('id').single()
    if (error) throw new Error(error.message)
    row = data
  } else {
    const { data, error } = await supabase.from('attendance_logs').insert({
      employee_id: emp.id, log_date, ...patch,
    }).select('id').single()
    if (error) throw new Error(error.message)
    row = data
  }
  return { logged: true, employee_name: emp.full_name, action, log_date, attendance_id: row.id }
}

async function attendanceReportTool(input) {
  const year = Number(input.year) || new Date().getUTCFullYear()
  const month = Number(input.month) || (new Date().getUTCMonth() + 1)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  let q = supabase.from('attendance_logs')
    .select('employee_id, log_date, status, late_minutes, team_members:employee_id (full_name)')
    .gte('log_date', from).lte('log_date', to)
  if (input.employee_id) q = q.eq('employee_id', input.employee_id)
  const { data, error } = await q
  if (error) throw new Error(error.message)

  const per = new Map()
  for (const r of (data ?? [])) {
    const k = r.employee_id
    if (!per.has(k)) per.set(k, { employee_id: k, employee_name: r.team_members?.full_name ?? '—', present: 0, wfh: 0, late: 0, absent: 0, total_late_minutes: 0 })
    const m = per.get(k)
    m[r.status] = (m[r.status] || 0) + 1
    if (r.status === 'late') m.total_late_minutes += Number(r.late_minutes || 0)
  }
  return { period: `${year}-${String(month).padStart(2, '0')}`, rows: Array.from(per.values()) }
}

// ---- F10: candidates ---------------------------------------------------------

async function addCandidateTool(input) {
  const row = {
    full_name: input.full_name,
    email: input.email ?? null,
    phone: input.phone ?? null,
    whatsapp: input.whatsapp ?? null,
    nationality: input.nationality ?? null,
    current_city: input.current_city ?? null,
    current_title: input.current_title ?? null,
    years_experience: input.years_experience ?? null,
    education: input.education ?? null,
    skills: Array.isArray(input.skills) ? input.skills : null,
    languages: Array.isArray(input.languages) ? input.languages : null,
    asking_salary: input.asking_salary ?? null,
    salary_currency: input.salary_currency || 'SAR',
    cv_url: input.cv_url ?? null,
    cv_text: input.cv_text ? String(input.cv_text).slice(0, 50_000) : null,
    notes: input.notes ?? null,
    status: 'new',
  }
  const { data, error } = await supabase.from('candidates').insert(row).select('id').single()
  if (error) throw new Error(`add candidate failed: ${error.message}`)

  await supabase.from('notifications').insert({
    user_id: null,
    title: `New candidate: ${input.full_name}`,
    message: `${input.current_title || 'Applicant'}${input.years_experience ? ` · ${input.years_experience}y exp` : ''}${input.asking_salary ? ` · asking ${input.asking_salary} ${row.salary_currency}` : ''}. Open /hr/candidates to review.`,
    type: 'candidate_new',
    related_id: data.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr/candidates', '/notifications'])
  return { candidate_id: data.id }
}

async function findCandidatesTool(input) {
  let q = supabase.from('candidates')
    .select('id, full_name, email, phone, current_title, years_experience, asking_salary, salary_currency, status, rating, created_at')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, input.limit ?? 20)))
  if (input.status) q = q.eq('status', input.status)
  if (input.q) q = q.or(`full_name.ilike.%${input.q}%,current_title.ilike.%${input.q}%,cv_text.ilike.%${input.q}%`)
  if (input.skill) q = q.contains('skills', [input.skill])
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { count: data.length, rows: data }
}

async function promoteCandidateTool(input) {
  await _requireAdmin()
  const { data: cand } = await supabase.from('candidates').select('*').eq('id', input.candidate_id).maybeSingle()
  if (!cand) throw new Error('candidate not found')
  if (cand.status === 'hired') throw new Error('candidate already hired')

  const teamRow = {
    full_name: cand.full_name,
    email: cand.email,
    phone: cand.phone,
    whatsapp: cand.whatsapp,
    job_title: input.job_title ?? cand.current_title,
    base_salary: input.base_salary ?? cand.asking_salary,
    salary_currency: cand.salary_currency || 'SAR',
    hire_date: input.hire_date || new Date().toISOString().slice(0, 10),
    employment_type: input.employment_type || 'full_time',
    nationality: cand.nationality,
    status: 'active',
  }
  const { data: tm, error: tErr } = await supabase.from('team_members').insert(teamRow).select('id').single()
  if (tErr) throw new Error(`promote failed: ${tErr.message}`)

  await supabase.from('candidates').update({
    status: 'hired',
    promoted_to_team_member_id: tm.id,
  }).eq('id', input.candidate_id)

  // Auto-start onboarding
  let onboarding = null
  try {
    onboarding = await startOnboardingTool({ employee_id: tm.id })
  } catch (err) {
    onboarding = { error: err?.message }
  }

  await revalidate(['/hr', '/hr/candidates', '/team'])
  return { promoted: true, team_member_id: tm.id, onboarding }
}

// ---- F11: HR letters ---------------------------------------------------------

// KSA Labour Law references per document type — auto-filled when admin doesn't
// override. Receivers (banks, embassies, MoL) expect to see these on disciplinary,
// termination, and EOSB-related correspondence.
const KSA_LABOUR_LAW_CLAUSES = {
  // Discipline
  verbal_warning:   ['Article 80 (employer\'s right to terminate without notice for repeated breach)', 'Article 65 (employee\'s general obligations)'],
  written_warning:  ['Article 80', 'Article 65'],
  final_warning:    ['Article 80', 'Article 65'],
  suspension_letter:    ['Article 81 (suspension during investigation)'],
  disciplinary_notice:  ['Article 65', 'Article 80'],
  termination:      ['Article 80', 'Article 77 (severance + EOSB)', 'Article 84 (end-of-service award)'],
  // Compensation/EOSB
  final_settlement_letter: ['Article 84 (end-of-service award)', 'Article 88 (final settlement timing)'],
  retirement_letter: ['Article 84', 'GOSI Pension Law'],
  // Leave
  maternity_leave_letter: ['Article 151 (10 weeks paid maternity leave)'],
  paternity_leave_letter: ['Article 113 (3 days paternity leave)'],
  hajj_leave_letter: ['Article 114 (10-15 days hajj leave, once per service)'],
  sick_leave_notice: ['Article 117 (sick-leave entitlement: 30d full pay, 60d 75%, 30d unpaid)'],
  bereavement_leave_letter: ['Article 113 (bereavement leave)'],
  // External / financial
  bank_loan_support_letter: [],
  visa_support_letter: [],
  loan_request_letter: ['Article 92 (deductions from salary, max 50%)'],
  salary_advance_letter: ['Article 92'],
  // Hiring
  employment_contract: ['Article 50 (written contract requirement)', 'Article 53 (contract content)'],
  job_offer: ['Article 50'],
  nda: ['Article 65 (confidentiality)', 'Article 83 (post-employment non-compete)'],
  probation_completion: ['Article 53 (max 90-day probation, optional 90-day extension)'],
  // Saudization / GOSI
  hrdf_letter: ['HRDF training program regulations'],
  gosi_subscription_letter: ['GOSI Law Article 4'],
  saudization_letter: ['Nitaqat program rules'],
  // Catch-all
  custom:           [],
}

// Helpers used by every template
function _empName(emp, ar = false) {
  if (ar && emp.full_name_ar) return emp.full_name_ar
  return emp.full_name || '—'
}
function _empTitle(emp, ar = false) {
  if (ar && emp.job_title_ar) return emp.job_title_ar
  return emp.job_title || '—'
}
function _empIdLine(emp, ar = false) {
  if (emp.iqama_number) return ar ? `(إقامة ${emp.iqama_number})` : `(Iqama ${emp.iqama_number})`
  if (emp.national_id) return ar ? `(هوية ${emp.national_id})` : `(National ID ${emp.national_id})`
  return ''
}
function _refsLine(refs, ar = false) {
  if (!refs?.length) return ''
  return ar ? `المراجع: ${refs.join(' · ')}` : `References: ${refs.join(' · ')}`
}
function _money(n, cur = 'SAR') {
  return `${Number(n ?? 0).toLocaleString('en-US')} ${cur}`
}
function _signEn() { return 'Signed,\nEmergize HR\ninfo@emergize-sa.com' }
function _signAr() { return 'التوقيع،\nالموارد البشرية - إيميرجايز\ninfo@emergize-sa.com' }

async function draftHrLetterTool(input) {
  await _requireAdmin()
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  if (!empId) throw new Error('Specify employee_id or employee_name.')

  const { data: emp } = await supabase.from('team_members')
    .select('id, full_name, full_name_ar, job_title, job_title_ar, department, hire_date, base_salary, salary_currency, housing_allowance, transport_allowance, other_allowances, nationality, iqama_number, national_id, gosi_subject')
    .eq('id', empId).maybeSingle()
  if (!emp) throw new Error('employee not found')

  const refs = input.reference_clauses?.length ? input.reference_clauses : KSA_LABOUR_LAW_CLAUSES[input.letter_type] || []
  const today = new Date().toISOString().slice(0, 10)
  const meta = input.meta || {}

  const bodies = _renderLetterBody(input.letter_type, emp, input.subject, input.context, refs, today, meta)

  const { data: letter, error } = await supabase.from('hr_letters').insert({
    employee_id: empId,
    letter_type: input.letter_type,
    subject: input.subject,
    body_en: bodies.en,
    body_ar: bodies.ar,
    reference_clauses: refs,
    status: 'draft',
    meta,
  }).select('id').single()
  if (error) throw new Error(`draft letter failed: ${error.message}`)

  // Notify the HR admin (broadcast — picked up by /notifications page).
  await supabase.from('notifications').insert({
    user_id: null,
    title: `HR letter drafted: ${input.letter_type.replace(/_/g, ' ')} for ${emp.full_name}`,
    message: (input.subject || '').slice(0, 300) + ' — review at /hr/letters/' + letter.id,
    type: 'hr_letter_draft',
    related_id: letter.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr/letters', '/notifications'])
  return {
    letter_id: letter.id,
    letter_type: input.letter_type,
    body_en: bodies.en,
    body_ar: bodies.ar,
    references: refs,
    review_url: `/hr/letters/${letter.id}`,
  }
}

// =============================================================================
// HR letter template catalog — bilingual EN/AR, KSA-labour-law-aware.
// Every letter is rendered via _renderLetterBody(type, emp, subject, context,
// refs, today, meta). `meta` carries type-specific payload (loan amount,
// vacation dates, transfer dest, etc.) — see request schema in definitions.js.
// =============================================================================
function _renderLetterBody(type, emp, subject, context, refs, today, meta = {}) {
  const nameEn = _empName(emp, false), nameAr = _empName(emp, true)
  const titleEn = _empTitle(emp, false), titleAr = _empTitle(emp, true)
  const idEn = _empIdLine(emp, false), idAr = _empIdLine(emp, true)
  const refsLine = _refsLine(refs, false), refsLineAr = _refsLine(refs, true)
  const ctxLine = context ? `\n\n${context}` : ''
  const ctxLineAr = context ? `\n\n${context}` : ''
  const dept = emp.department ? `, ${emp.department}` : ''
  const deptAr = emp.department ? `، قسم ${emp.department}` : ''
  const salary = _money(emp.base_salary, emp.salary_currency || 'SAR')

  // Build common preamble/signature blocks
  const hdr = (titleLine) => `${titleLine}\n\nDate: ${today}\nTo: ${nameEn}${titleEn !== '—' ? `, ${titleEn}` : ''}${dept} ${idEn}\nSubject: ${subject || titleLine}\n`
  const hdrAr = (titleLine) => `${titleLine}\n\nالتاريخ: ${today}\nإلى: ${nameAr}${titleAr !== '—' ? `، ${titleAr}` : ''}${deptAr} ${idAr}\nالموضوع: ${subject || titleLine}\n`

  switch (type) {
    // ---- HIRING / ONBOARDING ------------------------------------------------
    case 'job_offer':
      return {
        en: `${hdr('Job Offer Letter')}\nDear ${nameEn},\n\nWe are pleased to offer you the position of ${meta.proposed_title || titleEn} at Emergize, with a monthly gross salary of ${_money(meta.proposed_salary || emp.base_salary, emp.salary_currency)}${meta.proposed_start ? `, starting ${meta.proposed_start}` : ''}. Other terms (allowances, leave, probation period, working hours) are governed by your employment contract and the Saudi Labour Law.${ctxLine}\n\nThis offer is valid for 7 days from the date above. To accept, please countersign and return this letter.\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('عرض عمل')}\nالأخ/ت ${nameAr}،\n\nيسعدنا تقديم عرض العمل لشغل وظيفة ${meta.proposed_title || titleAr} لدى إيميرجايز، براتب شهري إجمالي قدره ${_money(meta.proposed_salary || emp.base_salary, emp.salary_currency)}${meta.proposed_start ? `، تبدأ من ${meta.proposed_start}` : ''}. تخضع باقي البنود (البدلات، الإجازات، فترة التجربة، ساعات العمل) لعقد العمل ولنظام العمل في المملكة العربية السعودية.${ctxLineAr}\n\nهذا العرض ساري لمدة 7 أيام من تاريخه. للقبول، يُرجى التوقيع وإعادة هذه الرسالة.\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'employment_contract':
      return {
        en: `${hdr('Employment Contract')}\n\nThis contract is entered into between Emergize ("Employer") and ${nameEn} ${idEn} ("Employee"), effective ${emp.hire_date || today}. Position: ${titleEn}. Monthly salary: ${salary} (plus allowances as itemized in Schedule A). Working hours: 40/week. Probation: 90 days from start date. Annual leave: 21 days. Sick leave per KSA Labour Law Article 117. Termination per Articles 74–88. Full terms attached.${ctxLine}\n\n${refsLine}\n\n${_signEn()}\n\n_____________________   _____________________\nEmployer signature           Employee signature`,
        ar: `${hdrAr('عقد عمل')}\n\nأُبرم هذا العقد بين شركة إيميرجايز ("صاحب العمل") و${nameAr} ${idAr} ("الموظف")، اعتباراً من ${emp.hire_date || today}. المنصب: ${titleAr}. الراتب الشهري: ${salary} (مع البدلات الموضحة في الملحق أ). ساعات العمل: 40/أسبوع. التجربة: 90 يوماً من تاريخ المباشرة. الإجازة السنوية: 21 يوماً. الإجازة المرضية وفق المادة 117 من نظام العمل. الإنهاء وفق المواد 74-88. كامل البنود مرفق.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}\n\n_____________________   _____________________\nتوقيع صاحب العمل           توقيع الموظف`,
      }

    case 'employment_letter':
      return {
        en: `${hdr('Employment Confirmation Letter')}\nTo Whom It May Concern,\n\nThis is to confirm that ${nameEn} ${idEn} is currently employed at Emergize as ${titleEn}${dept} since ${emp.hire_date || '—'}.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب تأكيد عمل')}\nإلى من يهمه الأمر،\n\nنُفيدكم بأن السيد/ة ${nameAr} ${idAr} يعمل حالياً لدى شركة إيميرجايز بصفة ${titleAr}${deptAr} منذ ${emp.hire_date || '—'}.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'nda':
      return {
        en: `${hdr('Non-Disclosure Agreement')}\n\nBy signing below, ${nameEn} acknowledges and agrees to keep confidential all proprietary information of Emergize and its clients during and after employment. Confidential information includes (but is not limited to) client lists, financials, strategy documents, source code, designs, and trade secrets. Breach may result in termination and legal action per KSA Labour Law Article 83 and applicable IP law.${ctxLine}\n\n${refsLine}\n\n_____________________      ${today}\nEmployee signature\n\n${_signEn()}`,
        ar: `${hdrAr('اتفاقية عدم إفصاح')}\n\nبتوقيعه أدناه، يقرّ ${nameAr} ويتعهد بالحفاظ على سرية جميع المعلومات الخاصة بشركة إيميرجايز وعملائها أثناء وبعد فترة العمل. تشمل المعلومات السرية (دون حصر) قوائم العملاء، البيانات المالية، وثائق الاستراتيجية، الأكواد المصدرية، التصاميم، والأسرار التجارية. يترتب على المخالفة الإنهاء واتخاذ الإجراءات القانونية وفق المادة 83 من نظام العمل وقوانين الملكية الفكرية المعمول بها.${ctxLineAr}\n\n${refsLineAr}\n\n_____________________      ${today}\nتوقيع الموظف\n\n${_signAr()}`,
      }

    case 'probation_completion':
      return {
        en: `${hdr('Probation Period Completion')}\nDear ${nameEn},\n\nWe are pleased to confirm that you have successfully completed your 90-day probation period as ${titleEn} at Emergize. Your employment is hereby confirmed on a permanent basis with all associated benefits.${ctxLine}\n\nWelcome to the team — looking forward to your continued contribution.\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('إتمام فترة التجربة')}\nالأخ/ت ${nameAr}،\n\nيسعدنا تأكيد إكمالك بنجاح فترة التجربة (90 يوماً) كموظف ${titleAr} في شركة إيميرجايز. يُثبَّت توظيفك بشكل دائم اعتباراً من تاريخه مع كافة المزايا المرتبطة.${ctxLineAr}\n\nمرحباً بك في الفريق — نتطلع إلى استمرار عطائك.\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'job_description':
      return {
        en: `${hdr('Job Description — ' + (meta.role_title || titleEn))}\n\nPosition: ${meta.role_title || titleEn}\nReports to: ${meta.reports_to || '—'}\nDepartment: ${meta.department || emp.department || '—'}\n\nResponsibilities:\n${meta.responsibilities || '(to be filled in)'}\n\nRequirements:\n${meta.requirements || '(to be filled in)'}\n\nKPIs:\n${meta.kpis || '(to be filled in)'}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('وصف وظيفي — ' + (meta.role_title || titleAr))}\n\nالمسمى الوظيفي: ${meta.role_title || titleAr}\nالتقرير إلى: ${meta.reports_to || '—'}\nالقسم: ${meta.department || emp.department || '—'}\n\nالمسؤوليات:\n${meta.responsibilities || '(تُحدَّد)'}\n\nالمتطلبات:\n${meta.requirements || '(تُحدَّد)'}\n\nمؤشرات الأداء:\n${meta.kpis || '(تُحدَّد)'}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    // ---- COMPENSATION / CAREER ---------------------------------------------
    case 'salary_certificate':
      return {
        en: `${hdr('Salary Certificate')}\nTo Whom It May Concern,\n\nThis is to certify that ${nameEn} ${idEn} has been employed at Emergize since ${emp.hire_date || '—'} in the capacity of ${titleEn}${dept}, drawing a monthly basic salary of ${salary}${emp.housing_allowance ? `, housing allowance ${_money(emp.housing_allowance, emp.salary_currency)}` : ''}${emp.transport_allowance ? `, transport allowance ${_money(emp.transport_allowance, emp.salary_currency)}` : ''}.${ctxLine}\n\nIssued on ${today} at the employee's request.\n\n${_signEn()}`,
        ar: `${hdrAr('شهادة راتب')}\nإلى من يهمه الأمر،\n\nنُفيدكم بأن السيد/ة ${nameAr} ${idAr} يعمل لدى شركة إيميرجايز منذ ${emp.hire_date || '—'} بصفة ${titleAr}${deptAr}، براتب أساسي شهري قدره ${salary}${emp.housing_allowance ? `، بدل سكن ${_money(emp.housing_allowance, emp.salary_currency)}` : ''}${emp.transport_allowance ? `، بدل نقل ${_money(emp.transport_allowance, emp.salary_currency)}` : ''}.${ctxLineAr}\n\nصدر بتاريخ ${today} بناءً على طلب الموظف.\n\n${_signAr()}`,
      }

    case 'salary_certificate_for_bank':
      return {
        en: `${hdr('Salary Certificate (for Bank)')}\nTo: ${meta.bank_name || 'The Bank Manager'}\n\nThis is to certify that ${nameEn} ${idEn} is permanently employed at Emergize since ${emp.hire_date || '—'} as ${titleEn}${dept}. Monthly compensation breakdown:\n  • Basic salary:        ${salary}\n  • Housing allowance:   ${_money(emp.housing_allowance, emp.salary_currency)}\n  • Transport allowance: ${_money(emp.transport_allowance, emp.salary_currency)}\n  • Other allowances:    ${_money(emp.other_allowances, emp.salary_currency)}\n\nSalary is transferred to the employee's account at ${meta.bank_name || '___'} on or before the 5th of each month. We undertake to channel the employee's salary through your bank if the employee's loan/account is established with you.${ctxLine}\n\nIssued on ${today}.\n\n${_signEn()}`,
        ar: `${hdrAr('شهادة راتب (للبنك)')}\nإلى: ${meta.bank_name || 'مدير البنك'}\n\nنُفيدكم بأن السيد/ة ${nameAr} ${idAr} يعمل بصفة دائمة لدى شركة إيميرجايز منذ ${emp.hire_date || '—'} بصفة ${titleAr}${deptAr}. تفاصيل الراتب الشهري:\n  • الراتب الأساسي:    ${salary}\n  • بدل السكن:         ${_money(emp.housing_allowance, emp.salary_currency)}\n  • بدل النقل:         ${_money(emp.transport_allowance, emp.salary_currency)}\n  • بدلات أخرى:        ${_money(emp.other_allowances, emp.salary_currency)}\n\nيُحوَّل الراتب إلى حساب الموظف لدى ${meta.bank_name || '___'} في موعد أقصاه اليوم الخامس من كل شهر. ونتعهد بتوجيه الراتب عبر بنككم في حال إقرار التمويل/الحساب.${ctxLineAr}\n\nصدر بتاريخ ${today}.\n\n${_signAr()}`,
      }

    case 'raise_letter':
      return {
        en: `${hdr('Salary Increment Letter')}\nDear ${nameEn},\n\nIn recognition of your performance, we are pleased to inform you that effective ${meta.effective_date || today}, your monthly basic salary will be revised from ${_money(meta.old_salary || emp.base_salary, emp.salary_currency)} to ${_money(meta.new_salary, emp.salary_currency)}${meta.pct_increase ? ` (a ${meta.pct_increase}% increase)` : ''}.${ctxLine}\n\nAll other terms of your employment contract remain unchanged.\n\nThank you for your continued contribution.\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب علاوة')}\nالأخ/ت ${nameAr}،\n\nتقديراً لأدائك، يسعدنا إبلاغك بأنه اعتباراً من ${meta.effective_date || today} سيتم تعديل راتبك الأساسي الشهري من ${_money(meta.old_salary || emp.base_salary, emp.salary_currency)} إلى ${_money(meta.new_salary, emp.salary_currency)}${meta.pct_increase ? ` (بزيادة قدرها ${meta.pct_increase}%)` : ''}.${ctxLineAr}\n\nتبقى جميع بنود عقد عملك الأخرى دون تغيير.\n\nشكراً لك على عطائك المتواصل.\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'promotion_letter':
      return {
        en: `${hdr('Promotion Letter')}\nDear ${nameEn},\n\nIn recognition of your outstanding performance, we are pleased to announce your promotion from ${titleEn} to ${meta.new_title || '(new title)'}${meta.new_department ? `, in the ${meta.new_department} department` : ''}, effective ${meta.effective_date || today}.${meta.new_salary ? ` Your new monthly basic salary will be ${_money(meta.new_salary, emp.salary_currency)}.` : ''}${ctxLine}\n\nWe look forward to your continued contribution in your expanded role.\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب ترقية')}\nالأخ/ت ${nameAr}،\n\nتقديراً لأدائك المتميز، يسعدنا إعلامك بترقيتك من ${titleAr} إلى ${meta.new_title || '(المسمى الجديد)'}${meta.new_department ? `، في قسم ${meta.new_department}` : ''}، اعتباراً من ${meta.effective_date || today}.${meta.new_salary ? ` راتبك الأساسي الشهري الجديد ${_money(meta.new_salary, emp.salary_currency)}.` : ''}${ctxLineAr}\n\nنتطلع إلى استمرار عطائك في دورك الموسَّع.\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'bonus_letter':
      return {
        en: `${hdr('Bonus Award Letter')}\nDear ${nameEn},\n\nIn recognition of your contribution${meta.reason ? ` (${meta.reason})` : ''}, we are pleased to inform you that you have been awarded a bonus of ${_money(meta.amount, emp.salary_currency)}, payable with the ${meta.payable_month || 'next'} salary.${ctxLine}\n\nThank you for your dedication.\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب مكافأة')}\nالأخ/ت ${nameAr}،\n\nتقديراً لإسهاماتك${meta.reason ? ` (${meta.reason})` : ''}، يسعدنا إبلاغك بمنحك مكافأة قدرها ${_money(meta.amount, emp.salary_currency)}، تُصرف مع راتب ${meta.payable_month || 'الشهر القادم'}.${ctxLineAr}\n\nشكراً على تفانيك.\n\n${_signAr()}`,
      }

    case 'compensation_review':
      return {
        en: `${hdr('Annual Compensation Review')}\nDear ${nameEn},\n\nYour annual compensation review for ${meta.review_year || new Date().getFullYear()} has been completed. Outcome:\n  • Performance rating: ${meta.rating || '—'}\n  • Salary change: ${meta.old_salary ? _money(meta.old_salary) + ' → ' : ''}${_money(meta.new_salary || emp.base_salary, emp.salary_currency)}\n  • Bonus awarded: ${_money(meta.bonus_amount || 0, emp.salary_currency)}\n  • Effective from: ${meta.effective_date || today}${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('مراجعة الأجر السنوية')}\nالأخ/ت ${nameAr}،\n\nاكتملت مراجعة أجرك السنوية لعام ${meta.review_year || new Date().getFullYear()}. النتائج:\n  • تقييم الأداء: ${meta.rating || '—'}\n  • تغيير الراتب: ${meta.old_salary ? _money(meta.old_salary) + ' ← ' : ''}${_money(meta.new_salary || emp.base_salary, emp.salary_currency)}\n  • المكافأة الممنوحة: ${_money(meta.bonus_amount || 0, emp.salary_currency)}\n  • سارية من: ${meta.effective_date || today}${ctxLineAr}\n\n${_signAr()}`,
      }

    // ---- LEAVE LETTERS -----------------------------------------------------
    case 'vacation_request_letter':
      return {
        en: `${hdr('Vacation Request')}\n\nI hereby request annual leave from ${meta.start_date} to ${meta.end_date} (${meta.days || '?'} working days)${meta.reason ? ` for: ${meta.reason}` : ''}. My duties will be covered by ${meta.coverage || 'a colleague to be arranged'} during my absence.${ctxLine}\n\nSubmitted by: ${nameEn}, ${titleEn}\n\nApproval (HR):  □ Approved   □ Rejected\nSignature: __________________   Date: __________`,
        ar: `${hdrAr('طلب إجازة سنوية')}\n\nأتقدم بطلب إجازة سنوية للفترة من ${meta.start_date} إلى ${meta.end_date} (${meta.days || '؟'} يوم عمل)${meta.reason ? ` للأسباب التالية: ${meta.reason}` : ''}. سيتم تغطية مهامي بواسطة ${meta.coverage || 'زميل سيتم تحديده'} أثناء غيابي.${ctxLineAr}\n\nمقدم الطلب: ${nameAr}، ${titleAr}\n\nقرار الموارد البشرية:  □ موافق   □ مرفوض\nالتوقيع: __________________   التاريخ: __________`,
      }

    case 'sick_leave_notice':
      return {
        en: `${hdr('Sick Leave Notice')}\n\nThis is to notify Emergize HR that ${nameEn} (${titleEn}) is unable to attend work from ${meta.start_date || today} to ${meta.end_date || today} due to medical reasons. ${meta.doctor_note_url ? 'A medical certificate is attached.' : 'A medical certificate will be submitted upon return.'} Sick-leave entitlement per Saudi Labour Law Article 117: 30 days full pay, next 60 days at 75%, then 30 days unpaid per service year.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('إشعار إجازة مرضية')}\n\nنُفيد الموارد البشرية بأن ${nameAr} (${titleAr}) غير قادر على الحضور للعمل من ${meta.start_date || today} إلى ${meta.end_date || today} لأسباب صحية. ${meta.doctor_note_url ? 'مرفق تقرير طبي.' : 'سيُقدَّم التقرير الطبي عند العودة.'} استحقاق الإجازة المرضية وفق المادة 117: 30 يوماً براتب كامل، 60 يوماً بربع راتب، ثم 30 يوماً بدون راتب لكل سنة خدمة.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'maternity_leave_letter':
      return {
        en: `${hdr('Maternity Leave Letter')}\nDear ${nameEn},\n\nThis letter confirms approval of your maternity leave from ${meta.start_date} to ${meta.end_date} (10 weeks per KSA Labour Law Article 151) at full pay. Your position and benefits are protected during this period.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إجازة أمومة')}\nالأخ/ت ${nameAr}،\n\nنؤكد الموافقة على إجازة الأمومة الممنوحة لك من ${meta.start_date} إلى ${meta.end_date} (10 أسابيع وفق المادة 151 من نظام العمل) براتب كامل. وظيفتك ومزاياك محفوظة خلال هذه الفترة.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'paternity_leave_letter':
      return {
        en: `${hdr('Paternity Leave Letter')}\nDear ${nameEn},\n\nCongratulations. Your paternity leave is approved from ${meta.start_date} to ${meta.end_date} (3 days per KSA Labour Law Article 113), with full pay.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إجازة أبوة')}\nالأخ/ت ${nameAr}،\n\nمبروك. تم اعتماد إجازة الأبوة من ${meta.start_date} إلى ${meta.end_date} (3 أيام وفق المادة 113) براتب كامل.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'hajj_leave_letter':
      return {
        en: `${hdr('Hajj Leave Letter')}\nDear ${nameEn},\n\nWe confirm approval of your Hajj leave from ${meta.start_date} to ${meta.end_date} (10–15 days per KSA Labour Law Article 114, once per service). Your position and benefits are preserved during this period. We wish you a blessed pilgrimage.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إجازة حج')}\nالأخ/ت ${nameAr}،\n\nنؤكد الموافقة على إجازة الحج من ${meta.start_date} إلى ${meta.end_date} (10-15 يوماً وفق المادة 114، مرة واحدة طوال فترة الخدمة). محفوظة وظيفتك ومزاياك خلال هذه الفترة. تقبّل الله طاعتكم.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'bereavement_leave_letter':
      return {
        en: `${hdr('Bereavement Leave Letter')}\nDear ${nameEn},\n\nWe extend our heartfelt condolences. Your bereavement leave is approved from ${meta.start_date} to ${meta.end_date}${meta.days ? ` (${meta.days} days)` : ''} with full pay per the Saudi Labour Law.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إجازة عزاء')}\nالأخ/ت ${nameAr}،\n\nنُعرب عن صادق تعازينا. تم اعتماد إجازة العزاء من ${meta.start_date} إلى ${meta.end_date}${meta.days ? ` (${meta.days} أيام)` : ''} براتب كامل وفق نظام العمل.\nأحسن الله عزاءك.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'unpaid_leave_letter':
      return {
        en: `${hdr('Unpaid Leave Letter')}\nDear ${nameEn},\n\nYour unpaid leave request is approved from ${meta.start_date} to ${meta.end_date} (${meta.days || '?'} days). During this period your salary will be prorated and ${meta.days || '?'} days will be deducted from the relevant payroll. Your employment status remains active.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إجازة بدون راتب')}\nالأخ/ت ${nameAr}،\n\nتم اعتماد طلبك للحصول على إجازة بدون راتب من ${meta.start_date} إلى ${meta.end_date} (${meta.days || '؟'} أيام). يُحسب الراتب على أساس نسبة الأيام ويُخصم ${meta.days || '؟'} يوماً من راتب الشهر المعني. تبقى علاقتك الوظيفية سارية.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'return_to_work_letter':
      return {
        en: `${hdr('Return to Work Letter')}\nDear ${nameEn},\n\nWelcome back. This confirms your return to work on ${meta.return_date || today} after your ${meta.leave_type || 'leave'} period (${meta.leave_start || '—'} → ${meta.leave_end || '—'}). Your role, salary, and benefits remain unchanged.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب عودة إلى العمل')}\nالأخ/ت ${nameAr}،\n\nمرحباً بعودتك. نؤكد عودتك للعمل اعتباراً من ${meta.return_date || today} بعد إجازة ${meta.leave_type || ''} (${meta.leave_start || '—'} ← ${meta.leave_end || '—'}). يبقى منصبك وراتبك ومزاياك دون تغيير.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'leave_approval_letter':
      return {
        en: `${hdr('Leave Approval')}\nDear ${nameEn},\n\nYour ${meta.leave_type || 'leave'} request from ${meta.start_date} to ${meta.end_date} (${meta.days || '?'} days) is approved.${meta.condition ? ` Condition: ${meta.condition}.` : ''} Please coordinate handover before departure.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('موافقة على إجازة')}\nالأخ/ت ${nameAr}،\n\nتمت الموافقة على طلب إجازة ${meta.leave_type || ''} من ${meta.start_date} إلى ${meta.end_date} (${meta.days || '؟'} يوماً).${meta.condition ? ` بشرط: ${meta.condition}.` : ''} يُرجى تنسيق التسليم قبل المغادرة.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'leave_rejection_letter':
      return {
        en: `${hdr('Leave Request — Decision')}\nDear ${nameEn},\n\nAfter reviewing your ${meta.leave_type || 'leave'} request from ${meta.start_date} to ${meta.end_date}, we regret to inform you the request cannot be approved at this time. Reason: ${meta.reason || 'operational requirements'}.${meta.alternative ? ` Suggested alternative: ${meta.alternative}.` : ''}${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('قرار بشأن طلب إجازة')}\nالأخ/ت ${nameAr}،\n\nبعد مراجعة طلب إجازة ${meta.leave_type || ''} من ${meta.start_date} إلى ${meta.end_date}، نأسف لإفادتك بعدم إمكانية الموافقة في الوقت الحالي. السبب: ${meta.reason || 'متطلبات العمل'}.${meta.alternative ? ` البديل المقترح: ${meta.alternative}.` : ''}${ctxLineAr}\n\n${_signAr()}`,
      }

    // ---- DISCIPLINE ---------------------------------------------------------
    case 'verbal_warning':
    case 'written_warning':
    case 'final_warning': {
      const labelEn = type === 'verbal_warning' ? 'Verbal Warning' : type === 'written_warning' ? 'Written Warning' : 'Final Warning'
      const labelAr = type === 'verbal_warning' ? 'إنذار شفهي' : type === 'written_warning' ? 'إنذار كتابي' : 'إنذار نهائي'
      return {
        en: `${hdr(labelEn)}\n\nThis serves as a formal ${labelEn.toLowerCase()} regarding the matter referenced above. We expect immediate corrective action. Continued breach may result in further disciplinary measures up to and including termination of your employment contract, in accordance with the Saudi Labour Law.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr(labelAr)}\n\nيُعتبر هذا الخطاب ${labelAr} رسمياً بشأن الموضوع المشار إليه أعلاه. نتوقع منكم اتخاذ إجراء تصحيحي فوري. يؤدي استمرار المخالفة إلى اتخاذ مزيد من الإجراءات التأديبية قد تصل إلى إنهاء عقد العمل، وفقاً لنظام العمل في المملكة العربية السعودية.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }
    }

    case 'suspension_letter':
      return {
        en: `${hdr('Suspension Letter')}\nDear ${nameEn},\n\nPending investigation of the matter referenced above, you are placed on suspension effective ${meta.effective_date || today}${meta.duration_days ? ` for ${meta.duration_days} days` : ''}, in accordance with Saudi Labour Law Article 81. ${meta.with_pay ? 'Salary will continue during suspension.' : 'Salary is withheld pending the outcome of investigation; if the matter is resolved in your favour, withheld pay will be reimbursed.'}${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب إيقاف عن العمل')}\nالأخ/ت ${nameAr}،\n\nبانتظار التحقيق في الموضوع المشار إليه، يتم إيقافك عن العمل اعتباراً من ${meta.effective_date || today}${meta.duration_days ? ` لمدة ${meta.duration_days} يوماً` : ''}، استناداً إلى المادة 81 من نظام العمل. ${meta.with_pay ? 'يستمر صرف الراتب أثناء فترة الإيقاف.' : 'يُحجز الراتب بانتظار نتائج التحقيق؛ في حال صدور القرار لصالحك يُعاد المحجوز.'}${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'disciplinary_notice':
      return {
        en: `${hdr('Disciplinary Notice')}\n\nThis notice is issued to address ${meta.violation || 'a workplace conduct matter'} per company policy and KSA Labour Law. ${meta.action || 'A formal hearing will be scheduled.'} Your right to respond in writing within 7 days is preserved.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('إشعار تأديبي')}\n\nيُصدَر هذا الإشعار لمعالجة ${meta.violation || 'مخالفة سلوكية في العمل'} وفق سياسات الشركة ونظام العمل. ${meta.action || 'سيتم تحديد جلسة استماع رسمية.'} لك الحق في الرد كتابياً خلال 7 أيام.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'termination':
      return {
        en: `${hdr('Termination Notice')}\nDear ${nameEn},\n\nThis letter serves as formal notice of the termination of your employment with Emergize, effective ${meta.effective_date || today}.${meta.reason ? ` Reason: ${meta.reason}.` : ''} Final settlement, including any accrued End-of-Service Benefits (EOSB), accrued leave balance, and pending dues, will be processed and credited within the statutory timeframe per Saudi Labour Law Article 88.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('إشعار إنهاء عمل')}\nالأخ/ت ${nameAr}،\n\nيُعتبر هذا الخطاب إشعاراً رسمياً بإنهاء عقد العمل لدى إيميرجايز اعتباراً من ${meta.effective_date || today}.${meta.reason ? ` السبب: ${meta.reason}.` : ''} ستتم تسوية المستحقات النهائية بما فيها مكافأة نهاية الخدمة وأيام الإجازة المتبقية وأي مستحقات أخرى، وصرفها خلال المدة المنصوص عليها في المادة 88 من نظام العمل.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    // ---- EXTERNAL ----------------------------------------------------------
    case 'noc':
      return {
        en: `${hdr('No-Objection Certificate (NOC)')}\nTo Whom It May Concern,\n\nEmergize hereby confirms that we have no objection regarding ${meta.purpose || 'the matter referenced above'} for our employee ${nameEn} ${idEn}, currently employed as ${titleEn}.${ctxLine}\n\nIssued on ${today}.\n\n${_signEn()}`,
        ar: `${hdrAr('شهادة عدم ممانعة')}\nإلى من يهمه الأمر،\n\nنُفيدكم بأن شركة إيميرجايز لا تُمانع في ${meta.purpose || 'الموضوع المشار إليه أعلاه'} للموظف ${nameAr} ${idAr}، الذي يعمل لدينا بصفة ${titleAr}.${ctxLineAr}\n\nصدر بتاريخ ${today}.\n\n${_signAr()}`,
      }

    case 'experience_letter':
      return {
        en: `${hdr('Experience Certificate')}\nTo Whom It May Concern,\n\nThis is to certify that ${nameEn} ${idEn} was employed at Emergize from ${emp.hire_date || '—'} to ${meta.end_date || today} in the capacity of ${titleEn}${dept}, where they performed their duties with diligence, professionalism, and integrity.${ctxLine}\n\nWe wish them continued success.\n\n${_signEn()}`,
        ar: `${hdrAr('شهادة خبرة')}\nإلى من يهمه الأمر،\n\nنُفيدكم بأن السيد/ة ${nameAr} ${idAr} عمل لدى شركة إيميرجايز خلال الفترة من ${emp.hire_date || '—'} حتى ${meta.end_date || today} بصفة ${titleAr}${deptAr}، وأدى مهامه بكل اجتهاد ومهنية ونزاهة.${ctxLineAr}\n\nنتمنى له دوام التوفيق.\n\n${_signAr()}`,
      }

    case 'bank_loan_support_letter':
      return {
        en: `${hdr('Bank Loan Support Letter')}\nTo: ${meta.bank_name || 'The Bank Manager'}\n\nWe confirm that ${nameEn} ${idEn} is permanently employed at Emergize as ${titleEn} since ${emp.hire_date || '—'} with a current monthly basic salary of ${salary}. We undertake to channel the employee's salary through your bank in the event of loan/credit-facility approval.${ctxLine}\n\nIssued on ${today}.\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب دعم تمويل بنكي')}\nإلى: ${meta.bank_name || 'مدير البنك'}\n\nنؤكد بأن السيد/ة ${nameAr} ${idAr} يعمل بصفة دائمة لدى شركة إيميرجايز بصفة ${titleAr} منذ ${emp.hire_date || '—'} براتب أساسي شهري قدره ${salary}. ونتعهد بتوجيه راتب الموظف عبر بنككم في حال إقرار التمويل/التسهيلات.${ctxLineAr}\n\nصدر بتاريخ ${today}.\n\n${_signAr()}`,
      }

    case 'visa_support_letter':
      return {
        en: `${hdr('Visa Support Letter')}\nTo: ${meta.embassy || 'The Honorable Embassy'}\n\nWe confirm that ${nameEn} ${idEn} is permanently employed at Emergize as ${titleEn} since ${emp.hire_date || '—'} with a current monthly salary of ${salary}. ${meta.travel_purpose ? `Purpose of travel: ${meta.travel_purpose}.` : 'The employee will undertake travel during their approved annual leave period.'} ${meta.travel_dates ? `Travel dates: ${meta.travel_dates}.` : ''} We confirm the employee will return to their duties at Emergize at the conclusion of the trip.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب دعم تأشيرة')}\nإلى: ${meta.embassy || 'السفارة الموقرة'}\n\nنؤكد بأن السيد/ة ${nameAr} ${idAr} يعمل بصفة دائمة لدى شركة إيميرجايز بصفة ${titleAr} منذ ${emp.hire_date || '—'} براتب شهري حالي قدره ${salary}. ${meta.travel_purpose ? `الغرض من السفر: ${meta.travel_purpose}.` : 'سيستغل الموظف فترة إجازته السنوية المعتمدة في السفر.'} ${meta.travel_dates ? `تواريخ السفر: ${meta.travel_dates}.` : ''} ونؤكد عودة الموظف إلى مقر عمله في الشركة عند انتهاء الرحلة.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'dependent_visa_support':
      return {
        en: `${hdr('Dependent Visa Support Letter')}\nTo: The Honorable Embassy / Consulate,\n\nWe confirm that ${nameEn} ${idEn}, employed at Emergize as ${titleEn} since ${emp.hire_date || '—'} with a monthly salary of ${salary}, is sponsoring his/her dependent(s) for visa application: ${meta.dependents || '(list of dependents)'}. We confirm the employee has sufficient means to support the dependent(s) during their stay.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب دعم تأشيرة مرافقين')}\nإلى: السفارة / القنصلية الموقرة،\n\nنؤكد بأن السيد/ة ${nameAr} ${idAr}، الذي يعمل لدى إيميرجايز بصفة ${titleAr} منذ ${emp.hire_date || '—'} براتب شهري قدره ${salary}، يكفل مرافقيه التاليين: ${meta.dependents || '(قائمة المرافقين)'}. ونؤكد توفر الإمكانيات الكافية لإعالة المرافقين خلال فترة إقامتهم.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'embassy_letter':
      return {
        en: `${hdr('Embassy Letter')}\nTo Whom It May Concern,\n\n${nameEn} ${idEn} is permanently employed at Emergize as ${titleEn} since ${emp.hire_date || '—'}. ${meta.purpose ? `Purpose of this letter: ${meta.purpose}.` : ''} We confirm the information stated herein is true to the best of our records.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب موجَّه للسفارة')}\nإلى من يهمه الأمر،\n\nالسيد/ة ${nameAr} ${idAr} يعمل بصفة دائمة لدى إيميرجايز بصفة ${titleAr} منذ ${emp.hire_date || '—'}. ${meta.purpose ? `الغرض من هذا الخطاب: ${meta.purpose}.` : ''} ونؤكد صحة المعلومات الواردة بحسب سجلاتنا.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'property_rental_support':
      return {
        en: `${hdr('Property Rental Support Letter')}\nTo: ${meta.landlord || 'The Landlord / Real-Estate Agent'},\n\nWe confirm that ${nameEn} ${idEn} is permanently employed at Emergize as ${titleEn} since ${emp.hire_date || '—'} with a monthly salary of ${salary}. The employee has sufficient and stable means to fulfill rental obligations.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب دعم استئجار سكن')}\nإلى: ${meta.landlord || 'مالك العقار / الوسيط العقاري'}،\n\nنؤكد بأن السيد/ة ${nameAr} ${idAr} يعمل بصفة دائمة لدى إيميرجايز بصفة ${titleAr} منذ ${emp.hire_date || '—'} براتب شهري قدره ${salary}. لدى الموظف الموارد الكافية والمستقرة للوفاء بالتزامات الإيجار.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'recommendation_letter':
      return {
        en: `${hdr('Letter of Recommendation')}\nTo Whom It May Concern,\n\nI am pleased to recommend ${nameEn}, who served as ${titleEn} at Emergize from ${emp.hire_date || '—'} to ${meta.end_date || today}. During this tenure, ${nameEn} consistently demonstrated ${meta.strengths || 'professionalism, integrity, and strong technical/business acumen'}. ${meta.highlight || 'Notable accomplishments include consistent delivery against deadlines and strong collaboration with cross-functional teams.'} I recommend ${nameEn} without reservation for any role aligned with their expertise.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب توصية')}\nإلى من يهمه الأمر،\n\nيسعدني التوصية بالسيد/ة ${nameAr}، الذي عمل بصفة ${titleAr} لدى إيميرجايز خلال الفترة من ${emp.hire_date || '—'} حتى ${meta.end_date || today}. خلال هذه المدة أظهر ${nameAr} باستمرار ${meta.strengths || 'المهنية والنزاهة والكفاءة التقنية والعملية'}. ${meta.highlight || 'من إنجازاته البارزة الالتزام بمواعيد التسليم والتعاون القوي مع الفرق متعددة الوظائف.'} وأوصي به دون تحفظ لأي دور يتوافق مع خبراته.${ctxLineAr}\n\n${_signAr()}`,
      }

    // ---- KSA-SPECIFIC ------------------------------------------------------
    case 'hrdf_letter':
      return {
        en: `${hdr('HRDF Letter')}\nTo: Human Resources Development Fund (HRDF),\n\nThis letter relates to ${meta.purpose || 'HRDF training programme support'} for our Saudi employee ${nameEn} (National ID ${emp.national_id || '—'}), employed at Emergize since ${emp.hire_date || '—'} as ${titleEn}.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب موجَّه لصندوق تنمية الموارد البشرية (هدف)')}\nإلى: صندوق تنمية الموارد البشرية (هدف)،\n\nيتعلق هذا الخطاب بـ${meta.purpose || 'دعم برنامج تدريبي ضمن مبادرات هدف'} للموظف السعودي ${nameAr} (الهوية الوطنية ${emp.national_id || '—'})، الذي يعمل لدى إيميرجايز منذ ${emp.hire_date || '—'} بصفة ${titleAr}.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'gosi_subscription_letter':
      return {
        en: `${hdr('GOSI Subscription Letter')}\nTo: General Organization for Social Insurance (GOSI),\n\nThis is to confirm the GOSI subscription record for our employee ${nameEn} ${idEn}, ${titleEn}, employed at Emergize since ${emp.hire_date || '—'}, with GOSI subject category: ${emp.gosi_subject || '—'}.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب اشتراك في التأمينات الاجتماعية')}\nإلى: المؤسسة العامة للتأمينات الاجتماعية،\n\nنُفيد بإثبات اشتراك التأمينات الاجتماعية للموظف ${nameAr} ${idAr}، ${titleAr}، العامل لدى إيميرجايز منذ ${emp.hire_date || '—'}، تصنيف التأمينات: ${emp.gosi_subject || '—'}.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'saudization_letter':
      return {
        en: `${hdr('Saudization Status Letter')}\nTo: ${meta.recipient || 'The Ministry of Human Resources and Social Development'},\n\nThis letter confirms our compliance with the Nitaqat Saudization program. ${meta.context || 'Details of our Saudi/non-Saudi workforce composition are available upon request.'}${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب توطين (نطاقات)')}\nإلى: ${meta.recipient || 'وزارة الموارد البشرية والتنمية الاجتماعية'}،\n\nنؤكد التزامنا ببرنامج التوطين (نطاقات). ${meta.context || 'تفاصيل تركيبة القوى العاملة السعودية وغير السعودية متاحة عند الطلب.'}${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'mudawana_amendment':
      return {
        en: `${hdr('Employment Contract Amendment')}\n\nThis amendment, entered into between Emergize and ${nameEn} ${idEn}, modifies the existing employment contract dated ${emp.hire_date || '—'} as follows:\n\n${meta.amendments || '(amendment details)'}\n\nEffective: ${meta.effective_date || today}. All other terms remain unchanged.${ctxLine}\n\n${refsLine}\n\n_____________________   _____________________\nEmployer signature           Employee signature\n\n${_signEn()}`,
        ar: `${hdrAr('ملحق عقد عمل')}\n\nأُبرم هذا الملحق بين شركة إيميرجايز و${nameAr} ${idAr}، تعديلاً لعقد العمل المؤرخ ${emp.hire_date || '—'} كما يلي:\n\n${meta.amendments || '(تفاصيل التعديل)'}\n\nالسريان: ${meta.effective_date || today}. تبقى باقي البنود دون تغيير.${ctxLineAr}\n\n${refsLineAr}\n\n_____________________   _____________________\nتوقيع صاحب العمل           توقيع الموظف\n\n${_signAr()}`,
      }

    // ---- FINANCIAL ----------------------------------------------------------
    case 'loan_request_letter':
      return {
        en: `${hdr('Salary Loan / Advance Request')}\n\nI hereby request a salary loan/advance of ${_money(meta.amount, emp.salary_currency)} ${meta.reason ? `for: ${meta.reason}` : ''}, repayable over ${meta.term_months || '?'} months via a monthly deduction of ${_money(meta.monthly_deduction, emp.salary_currency)} from my salary${meta.first_deduction ? ` starting ${meta.first_deduction}` : ''}. I confirm that this deduction will not exceed 50% of my net pay, as required by Saudi Labour Law Article 92.${ctxLine}\n\nSubmitted by: ${nameEn}, ${titleEn}\n\nApproval (HR/Finance):  □ Approved   □ Rejected\nSignature: __________________   Date: __________\n\n${refsLine}`,
        ar: `${hdrAr('طلب قرض / سلفة على الراتب')}\n\nأتقدم بطلب قرض/سلفة على راتبي بمبلغ ${_money(meta.amount, emp.salary_currency)} ${meta.reason ? `للغرض التالي: ${meta.reason}` : ''}، مسدداً على ${meta.term_months || '؟'} شهراً عن طريق خصم شهري قدره ${_money(meta.monthly_deduction, emp.salary_currency)} من راتبي${meta.first_deduction ? ` ابتداءً من ${meta.first_deduction}` : ''}. وأؤكد أن هذا الخصم لن يتجاوز 50% من صافي راتبي وفقاً للمادة 92 من نظام العمل.${ctxLineAr}\n\nمقدم الطلب: ${nameAr}، ${titleAr}\n\nقرار الموارد البشرية / المالية:  □ موافق   □ مرفوض\nالتوقيع: __________________   التاريخ: __________\n\n${refsLineAr}`,
      }

    case 'salary_advance_letter':
      return {
        en: `${hdr('Salary Advance')}\nDear ${nameEn},\n\nA salary advance of ${_money(meta.amount, emp.salary_currency)} has been approved and will be paid on ${meta.payment_date || today}. This advance will be recovered from your next ${meta.recovery_months || 1} month(s) of salary via a deduction of ${_money(meta.monthly_deduction, emp.salary_currency)} each month, in accordance with KSA Labour Law Article 92.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('سلفة على الراتب')}\nالأخ/ت ${nameAr}،\n\nتم اعتماد سلفة على راتبك بمبلغ ${_money(meta.amount, emp.salary_currency)} وستُصرف بتاريخ ${meta.payment_date || today}. سيتم استرداد هذه السلفة من راتب الـ ${meta.recovery_months || 1} شهر القادم عبر خصم ${_money(meta.monthly_deduction, emp.salary_currency)} شهرياً، وفقاً للمادة 92 من نظام العمل.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'salary_advance_repayment_schedule': {
      const schedRows = (meta.schedule || []).map((r, i) => `  ${i + 1}. ${r.month}: ${_money(r.amount, emp.salary_currency)}`).join('\n') || '  (schedule to be attached)'
      return {
        en: `${hdr('Loan Repayment Schedule')}\nDear ${nameEn},\n\nRepayment schedule for your salary loan of ${_money(meta.principal, emp.salary_currency)}:\n\n${schedRows}\n\nTotal: ${_money(meta.total, emp.salary_currency)} over ${meta.term_months || '?'} months.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('جدول سداد قرض')}\nالأخ/ت ${nameAr}،\n\nجدول سداد القرض البالغ ${_money(meta.principal, emp.salary_currency)}:\n\n${schedRows}\n\nالإجمالي: ${_money(meta.total, emp.salary_currency)} على ${meta.term_months || '؟'} شهراً.${ctxLineAr}\n\n${_signAr()}`,
      }
    }

    case 'expense_reimbursement_letter':
      return {
        en: `${hdr('Expense Reimbursement Notice')}\nDear ${nameEn},\n\nYour reimbursement request of ${_money(meta.amount, emp.salary_currency)} for ${meta.purpose || 'business expenses'}${meta.receipt_dates ? ` (receipts: ${meta.receipt_dates})` : ''} has been approved and will be credited with the next payroll cycle (${meta.payroll_month || 'next month'}).${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('إشعار استرداد نفقات')}\nالأخ/ت ${nameAr}،\n\nتم اعتماد طلب استرداد النفقات بمبلغ ${_money(meta.amount, emp.salary_currency)} لـ ${meta.purpose || 'نفقات عمل'}${meta.receipt_dates ? ` (تواريخ الفواتير: ${meta.receipt_dates})` : ''}، وسيُضاف مع راتب الشهر القادم (${meta.payroll_month || 'الشهر القادم'}).${ctxLineAr}\n\n${_signAr()}`,
      }

    // ---- LIFECYCLE ----------------------------------------------------------
    case 'resignation_letter':
      return {
        en: `${hdr('Resignation Letter')}\n\nDear Emergize HR,\n\nI, ${nameEn} (${titleEn}), hereby tender my resignation from my position at Emergize, effective ${meta.last_working_day || today}.${meta.reason ? ` Reason: ${meta.reason}.` : ''} I will ensure a smooth handover of my responsibilities and remain available to support the transition.${ctxLine}\n\nThank you for the opportunities and experience.\n\nSincerely,\n${nameEn}\n${today}`,
        ar: `${hdrAr('خطاب استقالة')}\n\nإلى الموارد البشرية - إيميرجايز،\n\nأنا ${nameAr} (${titleAr})، أتقدم بهذا الخطاب لتقديم استقالتي من وظيفتي لدى إيميرجايز، اعتباراً من ${meta.last_working_day || today}.${meta.reason ? ` السبب: ${meta.reason}.` : ''} وأتعهد بضمان تسليم مسؤولياتي بسلاسة، وسأبقى متاحاً لدعم مرحلة الانتقال.${ctxLineAr}\n\nشكراً على الفرص والخبرات.\n\nمع التقدير،\n${nameAr}\n${today}`,
      }

    case 'resignation_acceptance':
      return {
        en: `${hdr('Resignation Acceptance Letter')}\nDear ${nameEn},\n\nThis letter confirms acceptance of your resignation dated ${meta.resignation_date || today}. Your last working day will be ${meta.last_working_day || today}. We will process your final settlement (EOSB, accrued leave, pending dues) per Saudi Labour Law Article 88. Please coordinate with HR for the exit clearance process and asset return.${ctxLine}\n\nWe thank you for your contributions and wish you success in your future endeavours.\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب قبول استقالة')}\nالأخ/ت ${nameAr}،\n\nنؤكد قبول استقالتك المؤرخة ${meta.resignation_date || today}. آخر يوم عمل ${meta.last_working_day || today}. ستتم تسوية مستحقاتك النهائية (مكافأة نهاية الخدمة، رصيد الإجازات، أي مستحقات أخرى) وفق المادة 88 من نظام العمل. يُرجى التنسيق مع الموارد البشرية لإكمال إجراءات إخلاء الطرف وإعادة عُهدة الشركة.${ctxLineAr}\n\nنشكرك على إسهاماتك ونتمنى لك التوفيق في مساعيك المستقبلية.\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'transfer_letter':
      return {
        en: `${hdr('Internal Transfer Letter')}\nDear ${nameEn},\n\nThis letter confirms your transfer from ${meta.old_dept || emp.department || '—'} to ${meta.new_dept || '—'} as ${meta.new_title || titleEn}, effective ${meta.effective_date || today}.${meta.new_manager ? ` Your new manager is ${meta.new_manager}.` : ''} All compensation and benefits${meta.salary_change ? ` are adjusted as: ${meta.salary_change}` : ' remain unchanged'}.${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب نقل داخلي')}\nالأخ/ت ${nameAr}،\n\nنؤكد نقلك من ${meta.old_dept || emp.department || '—'} إلى ${meta.new_dept || '—'} بصفة ${meta.new_title || titleAr}، اعتباراً من ${meta.effective_date || today}.${meta.new_manager ? ` المدير المباشر الجديد: ${meta.new_manager}.` : ''} الراتب والمزايا${meta.salary_change ? ` كما يلي: ${meta.salary_change}` : ' دون تغيير'}.${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'relocation_letter':
      return {
        en: `${hdr('Relocation Letter')}\nDear ${nameEn},\n\nThis confirms your relocation from ${meta.old_location || '—'} to ${meta.new_location || '—'}, effective ${meta.effective_date || today}. ${meta.relocation_allowance ? `A relocation allowance of ${_money(meta.relocation_allowance, emp.salary_currency)} is approved.` : ''}${ctxLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب نقل جغرافي')}\nالأخ/ت ${nameAr}،\n\nنؤكد نقلك من ${meta.old_location || '—'} إلى ${meta.new_location || '—'}، اعتباراً من ${meta.effective_date || today}. ${meta.relocation_allowance ? `وتم اعتماد بدل نقل جغرافي قدره ${_money(meta.relocation_allowance, emp.salary_currency)}.` : ''}${ctxLineAr}\n\n${_signAr()}`,
      }

    case 'final_settlement_letter':
      return {
        en: `${hdr('Final Settlement Letter')}\nDear ${nameEn},\n\nFollowing the end of your employment with Emergize on ${meta.last_working_day || today}, this letter details your final settlement per Saudi Labour Law Articles 84 & 88:\n\n  • Years served:                  ${meta.years_served || '—'}\n  • Accrued EOSB:                  ${_money(meta.eosb_amount, emp.salary_currency)}\n  • Accrued leave (${meta.unused_leave_days || 0}d):    ${_money(meta.unused_leave_value, emp.salary_currency)}\n  • Pending salary:                ${_money(meta.pending_salary, emp.salary_currency)}\n  • Other dues:                    ${_money(meta.other_dues, emp.salary_currency)}\n  • Deductions / advances owed:    ${_money(meta.deductions, emp.salary_currency)}\n  ────────────────────────────────────────\n  • Net final settlement:          ${_money(meta.net_total, emp.salary_currency)}\n\nThis amount will be paid via bank transfer to your account on file within statutory timeframes.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب تسوية نهائية')}\nالأخ/ت ${nameAr}،\n\nبعد انتهاء علاقتك الوظيفية مع إيميرجايز بتاريخ ${meta.last_working_day || today}، يوضح هذا الخطاب تفاصيل التسوية النهائية وفق المادتين 84 و88 من نظام العمل:\n\n  • سنوات الخدمة:                    ${meta.years_served || '—'}\n  • مكافأة نهاية الخدمة:             ${_money(meta.eosb_amount, emp.salary_currency)}\n  • رصيد الإجازات (${meta.unused_leave_days || 0} يوم):     ${_money(meta.unused_leave_value, emp.salary_currency)}\n  • راتب مستحق:                      ${_money(meta.pending_salary, emp.salary_currency)}\n  • مستحقات أخرى:                    ${_money(meta.other_dues, emp.salary_currency)}\n  • خصومات / سُلَف مستحقة:           ${_money(meta.deductions, emp.salary_currency)}\n  ────────────────────────────────────────\n  • صافي التسوية النهائية:           ${_money(meta.net_total, emp.salary_currency)}\n\nسيتم تحويل المبلغ إلى حسابك البنكي المسجل خلال المدد النظامية.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    case 'exit_clearance_letter':
      return {
        en: `${hdr('Exit Clearance Form')}\n\nEmployee: ${nameEn} ${idEn}\nLast working day: ${meta.last_working_day || today}\n\nClearance checklist:\n  □ Laptop / equipment returned\n  □ Access badges returned\n  □ Email account disabled\n  □ Project handover completed\n  □ GOSI deregistered (if applicable)\n  □ Bank-account details confirmed for final settlement\n  □ NDA / IP obligations acknowledged\n\nSigned by department heads:\n_____ Direct Manager    _____ Finance    _____ IT    _____ HR\n\n${_signEn()}`,
        ar: `${hdrAr('إخلاء طرف')}\n\nالموظف: ${nameAr} ${idAr}\nآخر يوم عمل: ${meta.last_working_day || today}\n\nقائمة المعالجات:\n  □ إرجاع اللابتوب / المعدات\n  □ إرجاع بطاقات الدخول\n  □ تعطيل حساب البريد الإلكتروني\n  □ إكمال تسليم المشاريع\n  □ إلغاء الاشتراك في التأمينات (إن كان موظف سعودي)\n  □ تأكيد بيانات الحساب البنكي للتسوية النهائية\n  □ التذكير بالتزامات السرية والملكية الفكرية\n\nالتوقيعات:\n_____ المدير المباشر    _____ المالية    _____ تقنية المعلومات    _____ الموارد البشرية\n\n${_signAr()}`,
      }

    case 'retirement_letter':
      return {
        en: `${hdr('Retirement Letter')}\nDear ${nameEn},\n\nIt is with appreciation that we acknowledge your retirement from Emergize, effective ${meta.retirement_date || today}, after ${meta.years_served || '—'} years of dedicated service. Your end-of-service benefits will be processed per Saudi Labour Law Article 84 and GOSI pension regulations. We thank you for your significant contributions and wish you a long, healthy retirement.${ctxLine}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr('خطاب تقاعد')}\nالأخ/ت ${nameAr}،\n\nبكل تقدير، نُعلن تقاعدك من شركة إيميرجايز اعتباراً من ${meta.retirement_date || today}، بعد ${meta.years_served || '—'} عاماً من الخدمة المخلصة. سيتم احتساب مستحقات نهاية الخدمة وفقاً للمادة 84 من نظام العمل وأنظمة معاشات التأمينات. شكراً لك على إسهاماتك القيّمة ونتمنى لك تقاعداً مديداً ومليئاً بالصحة.${ctxLineAr}\n\n${refsLineAr}\n\n${_signAr()}`,
      }

    // ---- CATCH-ALL ---------------------------------------------------------
    case 'custom':
    default:
      return {
        en: `${hdr(subject || 'Letter')}\n\n${context || '(letter content)'}\n\n${refsLine}\n\n${_signEn()}`,
        ar: `${hdrAr(subject || 'خطاب')}\n\n${context || '(محتوى الخطاب)'}\n\n${refsLineAr}\n\n${_signAr()}`,
      }
  }
}

// ---- F12: HR documents -------------------------------------------------------

async function addHrDocumentTool(input) {
  let empId = input.employee_id ?? null
  if (!empId && input.employee_name) empId = await findOneTeamMemberIdByName(input.employee_name)
  if (!empId) throw new Error('Specify employee_id or employee_name.')

  const row = {
    employee_id: empId,
    doc_type: input.doc_type,
    file_path: input.file_path || input.file_url,
    file_url: input.file_url,
    doc_number: input.doc_number ?? null,
    issue_date: input.issue_date ?? null,
    expiry_date: input.expiry_date ?? null,
    notes: input.notes ?? null,
    ocr_text: input.ocr_text ? String(input.ocr_text).slice(0, 50_000) : null,
  }
  const { data, error } = await supabase.from('hr_documents').insert(row).select('id').single()
  if (error) throw new Error(`add doc failed: ${error.message}`)

  // Mirror common expiries onto team_members so the watchdog picks them up
  // straight from the employee row too.
  if (input.expiry_date && ['iqama', 'passport', 'visa'].includes(input.doc_type)) {
    await supabase.from('team_members').update({
      [`${input.doc_type}_expiry`]: input.expiry_date,
      ...(input.doc_number && input.doc_type === 'iqama' ? { iqama_number: input.doc_number } : {}),
    }).eq('id', empId).catch(() => null)
  }

  await revalidate(['/hr/documents', '/hr/expiries'])
  return { document_id: data.id }
}

async function findHrDocumentsTool(input) {
  let q = supabase.from('hr_documents')
    .select('id, employee_id, doc_type, doc_number, issue_date, expiry_date, file_url, notes, team_members:employee_id (full_name)')
    .order('expiry_date', { ascending: true, nullsFirst: false })
  if (input.employee_id) q = q.eq('employee_id', input.employee_id)
  if (input.doc_type) q = q.eq('doc_type', input.doc_type)
  if (input.expiring_within_days) {
    const cutoff = new Date(Date.now() + Number(input.expiring_within_days) * 86_400_000).toISOString().slice(0, 10)
    q = q.lte('expiry_date', cutoff).gte('expiry_date', new Date().toISOString().slice(0, 10))
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { count: data.length, rows: data.map((r) => ({ ...r, employee_name: r.team_members?.full_name })) }
}

// =============================================================================
// HR — EMPLOYEE SELF-SERVICE
//
// All "my_*" tools resolve the caller from their WhatsApp number → the
// team_members.whatsapp field. They're always scoped to the caller's own
// data — there's no way for an employee to peek at someone else's iqama,
// leave history, payslip, etc. Anyone DM'ing the bot can use these
// regardless of admin status; the destructive tools above (approve_leave,
// mark_payroll_paid, draft_hr_letter, etc.) still require admin.
// =============================================================================

async function _resolveSelfOrThrow() {
  const emp = await _resolveEmployeeFromSender()
  if (!emp) {
    throw new Error("I couldn't find you in the team directory. Ask the admin to add your WhatsApp number to your team_members record.")
  }
  return emp
}

async function myExpiriesTool() {
  const emp = await _resolveSelfOrThrow()
  const today = new Date().toISOString().slice(0, 10)

  // Pull native fields from team_members + any tracked HR documents
  const { data: me } = await supabase
    .from('team_members')
    .select('iqama_expiry, passport_expiry, visa_expiry, iqama_number')
    .eq('id', emp.id).maybeSingle()
  const { data: docs } = await supabase
    .from('hr_documents')
    .select('id, doc_type, doc_number, issue_date, expiry_date')
    .eq('employee_id', emp.id).not('expiry_date', 'is', null)
    .order('expiry_date')

  function daysOut(iso) {
    const d = (new Date(iso + 'T00:00:00Z').getTime() - new Date(today + 'T00:00:00Z').getTime()) / 86_400_000
    return Math.round(d)
  }
  const out = []
  if (me?.iqama_expiry)    out.push({ kind: 'iqama',    expiry: me.iqama_expiry,    days_until: daysOut(me.iqama_expiry),    number: me.iqama_number ?? null })
  if (me?.passport_expiry) out.push({ kind: 'passport', expiry: me.passport_expiry, days_until: daysOut(me.passport_expiry), number: null })
  if (me?.visa_expiry)     out.push({ kind: 'visa',     expiry: me.visa_expiry,     days_until: daysOut(me.visa_expiry),     number: null })
  for (const d of (docs ?? [])) {
    out.push({ kind: `document:${d.doc_type}`, expiry: d.expiry_date, days_until: daysOut(d.expiry_date), number: d.doc_number ?? null, document_id: d.id })
  }
  out.sort((a, b) => a.days_until - b.days_until)
  return { employee_name: emp.full_name, count: out.length, items: out }
}

async function myLeavesTool(input) {
  const emp = await _resolveSelfOrThrow()
  const limit = Math.max(1, Math.min(50, input?.limit ?? 10))
  const { data } = await supabase
    .from('leave_requests')
    .select('id, type, start_date, end_date, days, status, reason, decision_note, created_at, decided_at')
    .eq('employee_id', emp.id)
    .order('created_at', { ascending: false })
    .limit(limit)
  return { employee_name: emp.full_name, annual_leave_balance: emp.annual_leave_balance ?? 21, rows: data ?? [] }
}

async function myLeaveBalanceTool() {
  const emp = await _resolveSelfOrThrow()
  // Recompute used annual days this calendar year as a sanity check
  const yearStart = new Date().toISOString().slice(0, 4) + '-01-01'
  const { data: leaves } = await supabase
    .from('leave_requests').select('days, type, status')
    .eq('employee_id', emp.id).eq('type', 'annual').eq('status', 'approved')
    .gte('start_date', yearStart)
  const usedThisYear = (leaves ?? []).reduce((s, r) => s + Number(r.days || 0), 0)
  return {
    employee_name: emp.full_name,
    annual_leave_balance_remaining: emp.annual_leave_balance ?? 21,
    used_this_year: usedThisYear,
  }
}

async function myPayrollTool(input) {
  const emp = await _resolveSelfOrThrow()
  let q = supabase.from('payroll_records')
    .select('id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method')
    .eq('employee_id', emp.id)
    .order('period_year', { ascending: false }).order('period_month', { ascending: false })
    .limit(Math.max(1, Math.min(24, input?.limit ?? 6)))
  if (input?.year) q = q.eq('period_year', input.year)
  if (input?.month) q = q.eq('period_month', input.month)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return { employee_name: emp.full_name, rows: data ?? [] }
}

async function myPayBreakdownTool(input) {
  const emp = await _resolveSelfOrThrow()
  // Find the matching payroll row
  const now = new Date()
  const year = Number(input?.year) || now.getUTCFullYear()
  const month = Number(input?.month) || (now.getUTCMonth() + 1)
  const { data: pay } = await supabase
    .from('payroll_records')
    .select('id, period_year, period_month, gross_amount, deductions, bonus, net_amount, currency, status, paid_date, method')
    .eq('employee_id', emp.id).eq('period_year', year).eq('period_month', month).maybeSingle()
  if (!pay) {
    return { employee_name: emp.full_name, found: false, message: `No payroll row for ${year}-${String(month).padStart(2, '0')} yet.` }
  }
  const { data: lines } = await supabase
    .from('payroll_line_items')
    .select('label, label_ar, amount, is_deduction, kind').eq('payroll_id', pay.id).order('position')
  return { employee_name: emp.full_name, found: true, payroll: pay, line_items: lines ?? [] }
}

async function myEosbTool() {
  const emp = await _resolveSelfOrThrow()
  const { data: me } = await supabase
    .from('team_members')
    .select('hire_date, base_salary, salary_currency').eq('id', emp.id).maybeSingle()
  if (!me?.hire_date || !me?.base_salary) {
    return { employee_name: emp.full_name, message: 'Missing hire_date or base_salary on your record — ask admin to set them.' }
  }
  const hire = new Date(me.hire_date + 'T00:00:00Z').getTime()
  const yearsServed = Math.max(0, (Date.now() - hire) / (365.25 * 86_400_000))
  const monthly = Number(me.base_salary)
  const accrued = yearsServed <= 5
    ? monthly * 0.5 * yearsServed
    : monthly * 0.5 * 5 + monthly * 1.0 * (yearsServed - 5)
  return {
    employee_name: emp.full_name,
    hire_date: me.hire_date,
    years_served: Math.round(yearsServed * 100) / 100,
    monthly_salary: monthly,
    accrued_eosb: Math.round(accrued * 100) / 100,
    currency: me.salary_currency || 'SAR',
  }
}

async function requestMySalarySlipTool(input) {
  const emp = await _resolveSelfOrThrow()
  const now = new Date()
  const year = Number(input?.year) || now.getUTCFullYear()
  const month = Number(input?.month) || (now.getUTCMonth() + 1)
  const { data: pay } = await supabase
    .from('payroll_records').select('id, status').eq('employee_id', emp.id).eq('period_year', year).eq('period_month', month).maybeSingle()
  if (!pay) throw new Error(`No payroll row for ${year}-${String(month).padStart(2, '0')}. Ask admin to run payroll first.`)
  if (pay.status !== 'paid') throw new Error(`Slip not available yet — payroll is still ${pay.status}.`)
  return await sendSalarySlipTool({ payroll_id: pay.id, channel: input?.channel || 'both' })
}

async function myOnboardingTool() {
  const emp = await _resolveSelfOrThrow()
  const { data: chk } = await supabase
    .from('onboarding_checklists').select('id, template, status, started_at, completed_at').eq('employee_id', emp.id).maybeSingle()
  if (!chk) return { employee_name: emp.full_name, has_checklist: false }
  const { data: items } = await supabase
    .from('onboarding_checklist_items').select('id, title, title_ar, category, owner_role, due_offset_days, done, done_at')
    .eq('checklist_id', chk.id).order('position')
  return {
    employee_name: emp.full_name,
    has_checklist: true,
    checklist: chk,
    items: items ?? [],
    progress_pct: items?.length ? Math.round((items.filter(i => i.done).length / items.length) * 100) : 0,
  }
}

async function completeMyOnboardingItemTool(input) {
  const emp = await _resolveSelfOrThrow()
  // Only allow the caller to update their OWN checklist items.
  const { data: it } = await supabase
    .from('onboarding_checklist_items')
    .select('id, checklist_id, done, onboarding_checklists:checklist_id (employee_id)')
    .eq('id', input.item_id).maybeSingle()
  if (!it) throw new Error('Onboarding item not found.')
  const ownerEmp = it.onboarding_checklists?.employee_id
  if (ownerEmp !== emp.id) {
    // Allow admin to override
    const isAdmin = await _isAdminSender()
    if (!isAdmin) throw new Error("That's not one of your onboarding items.")
  }
  const { error } = await supabase
    .from('onboarding_checklist_items')
    .update({ done: true, done_at: new Date().toISOString() })
    .eq('id', input.item_id)
  if (error) throw new Error(error.message)
  await revalidate(['/hr/onboarding'])
  return { done: true, item_id: input.item_id }
}

async function myPerformanceTool(input) {
  const emp = await _resolveSelfOrThrow()
  return await performanceBriefTool({ employee_id: emp.id, days: input?.days })
}

async function myAttendanceTool(input) {
  const emp = await _resolveSelfOrThrow()
  const now = new Date()
  const year = Number(input?.year) || now.getUTCFullYear()
  const month = Number(input?.month) || (now.getUTCMonth() + 1)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  const { data: logs } = await supabase
    .from('attendance_logs').select('log_date, status, late_minutes, check_in_at, check_out_at')
    .eq('employee_id', emp.id).gte('log_date', from).lte('log_date', to)
    .order('log_date')

  const summary = { present: 0, wfh: 0, late: 0, absent: 0, late_minutes: 0 }
  for (const r of (logs ?? [])) {
    summary[r.status] = (summary[r.status] || 0) + 1
    if (r.status === 'late') summary.late_minutes += Number(r.late_minutes || 0)
  }
  return {
    employee_name: emp.full_name,
    period: `${year}-${String(month).padStart(2, '0')}`,
    summary,
    rows: logs ?? [],
  }
}

async function requestHrLetterTool(input) {
  const emp = await _resolveSelfOrThrow()
  if (!input.letter_type) throw new Error('letter_type is required.')
  const subject = input.subject || `${input.letter_type.replace(/_/g, ' ')} for ${emp.full_name}`

  // Create a draft on behalf of the employee — admin gets a notification to
  // review + edit + send. We don't call draftHrLetterTool directly because
  // that one requires admin; we want the EMPLOYEE to be able to kick off the
  // process, then admin completes it.
  const today = new Date().toISOString().slice(0, 10)
  const refs = KSA_LABOUR_LAW_CLAUSES[input.letter_type] || []
  const meta = input.meta || {}
  const { data: empFull } = await supabase
    .from('team_members')
    .select('id, full_name, full_name_ar, job_title, job_title_ar, department, hire_date, base_salary, salary_currency, housing_allowance, transport_allowance, other_allowances, iqama_number, national_id')
    .eq('id', emp.id).maybeSingle()
  const bodies = _renderLetterBody(input.letter_type, empFull, subject, input.reason, refs, today, meta)

  const { data: letter, error } = await supabase.from('hr_letters').insert({
    employee_id: emp.id,
    letter_type: input.letter_type,
    subject,
    body_en: bodies.en,
    body_ar: bodies.ar,
    reference_clauses: refs,
    status: 'draft',
    meta,
  }).select('id').single()
  if (error) throw new Error(`request letter failed: ${error.message}`)

  // Notify admin
  await supabase.from('notifications').insert({
    user_id: null,
    title: `Letter request: ${emp.full_name}`,
    message: `${emp.full_name} requested a ${input.letter_type.replace(/_/g, ' ')}${input.reason ? ` — ${input.reason}` : ''}. Review + send: /hr/letters/${letter.id}`,
    type: 'letter_request',
    related_id: letter.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr/letters', '/notifications'])
  return {
    requested: true,
    letter_id: letter.id,
    letter_type: input.letter_type,
    review_url: `/hr/letters/${letter.id}`,
    message: 'Letter draft created. Admin has been notified to review and send.',
  }
}

// =============================================================================
// LOAN / SALARY ADVANCE WORKFLOW
// Employee submits → admin approves on /hr/loans → on approval, monthly
// deductions auto-write into payroll_line_items for the next N months.
// KSA Labour Law Article 92: total deductions can't exceed 50% of net pay.
// =============================================================================

async function _resolveEmployeeIdForLoan(input) {
  if (input.override_employee_id) {
    const { data } = await supabase
      .from('team_members').select('id, full_name, base_salary, salary_currency')
      .eq('id', input.override_employee_id).maybeSingle()
    return data
  }
  return await _resolveEmployeeFromSender()
}

async function requestLoanTool(input) {
  const emp = await _resolveEmployeeIdForLoan(input)
  if (!emp) {
    throw new Error("Couldn't resolve which team member you are. Ask the admin to add your WhatsApp number to your team_members record, or use override_employee_id.")
  }

  const amount = Number(input.amount)
  const term = Number(input.term_months)
  if (!amount || amount <= 0) throw new Error('amount must be a positive number')
  if (!term || term < 1 || term > 60) throw new Error('term_months must be 1..60')
  const monthly = Math.round((amount / term) * 100) / 100
  const reason = input.reason || null

  // Sanity check: monthly deduction should not exceed ~50% of base salary
  const baseSalary = Number(emp.base_salary || 0)
  if (baseSalary && monthly > baseSalary * 0.5) {
    throw new Error(`Monthly deduction (${monthly}) exceeds 50% of base salary (${baseSalary}). Reduce amount or extend term_months — KSA Labour Law Article 92.`)
  }

  // First deduction defaults to next month
  const now = new Date()
  let fdMonth = (input.first_deduction_month) ?? (now.getUTCMonth() + 2)
  let fdYear = (input.first_deduction_year) ?? now.getUTCFullYear()
  if (fdMonth > 12) { fdMonth -= 12; fdYear += 1 }

  // Create the loan row
  const { data: loan, error } = await supabase.from('hr_loan_requests').insert({
    employee_id: emp.id,
    amount,
    currency: emp.salary_currency || 'SAR',
    reason,
    term_months: term,
    monthly_deduction: monthly,
    first_deduction_month: fdMonth,
    first_deduction_year: fdYear,
    status: 'submitted',
  }).select('id').single()
  if (error) throw new Error(`loan request failed: ${error.message}`)

  // Generate the formal loan-request letter (draft) and link it
  const { data: empFull } = await supabase
    .from('team_members')
    .select('id, full_name, full_name_ar, job_title, job_title_ar, department, hire_date, base_salary, salary_currency, iqama_number, national_id')
    .eq('id', emp.id).maybeSingle()
  const today = new Date().toISOString().slice(0, 10)
  const refs = KSA_LABOUR_LAW_CLAUSES['loan_request_letter']
  const meta = {
    amount, term_months: term, monthly_deduction: monthly, reason,
    first_deduction: `${fdYear}-${String(fdMonth).padStart(2,'0')}`,
  }
  const bodies = _renderLetterBody('loan_request_letter', empFull, `Loan request — ${emp.full_name}`, reason, refs, today, meta)
  const { data: letter } = await supabase.from('hr_letters').insert({
    employee_id: emp.id,
    letter_type: 'loan_request_letter',
    subject: `Loan request — ${emp.full_name} — ${amount} ${empFull.salary_currency || 'SAR'} over ${term}m`,
    body_en: bodies.en,
    body_ar: bodies.ar,
    reference_clauses: refs,
    status: 'draft',
    meta,
  }).select('id').single()

  await supabase.from('hr_loan_requests').update({ letter_id: letter?.id }).eq('id', loan.id).catch(() => null)

  // Notify admin
  await supabase.from('notifications').insert({
    user_id: null,
    title: `Loan request: ${emp.full_name}`,
    message: `${emp.full_name} requested a loan of ${amount} ${empFull.salary_currency || 'SAR'} over ${term} months (${monthly}/month). Review at /hr/loans.`,
    type: 'loan_request',
    related_id: loan.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr/loans', '/hr/letters', '/notifications'])
  return {
    requested: true,
    loan_id: loan.id,
    letter_id: letter?.id,
    amount, term_months: term, monthly_deduction: monthly,
    review_url: `/hr/loans/${loan.id}`,
    message: `Loan request submitted. Admin will review and approve. Monthly deduction: ${monthly} for ${term} months starting ${fdYear}-${String(fdMonth).padStart(2,'0')}.`,
  }
}

async function findLoansTool(input) {
  let q = supabase.from('hr_loan_requests')
    .select('id, employee_id, amount, currency, reason, term_months, monthly_deduction, first_deduction_year, first_deduction_month, status, decision_note, amount_repaid, created_at, team_members:employee_id (full_name, full_name_ar, job_title)')
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(100, input?.limit ?? 25)))
  if (input?.status) q = q.eq('status', input.status)
  if (input?.employee_id) q = q.eq('employee_id', input.employee_id)
  if (input?.employee_name) {
    const id = await findOneTeamMemberIdByName(input.employee_name)
    if (id) q = q.eq('employee_id', id)
  }
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return {
    count: data.length,
    rows: data.map((r) => ({ ...r, employee_name: r.team_members?.full_name })),
  }
}

async function approveLoanTool(input) {
  await _requireAdmin()
  if (!input.loan_id) throw new Error('loan_id required')
  const { data: loan } = await supabase
    .from('hr_loan_requests').select('*').eq('id', input.loan_id).maybeSingle()
  if (!loan) throw new Error('loan not found')
  if (loan.status !== 'submitted') throw new Error(`Cannot approve — current status is ${loan.status}.`)

  const { error } = await supabase.from('hr_loan_requests').update({
    status: 'approved',
    approved_at: new Date().toISOString(),
    decision_note: input.decision_note ?? null,
  }).eq('id', input.loan_id).eq('status', 'submitted')
  if (error) throw new Error(`approve failed: ${error.message}`)

  await revalidate(['/hr/loans'])
  return { approved: true, id: input.loan_id, message: `Loan approved. Monthly deduction of ${loan.monthly_deduction} will be added to payroll_line_items starting ${loan.first_deduction_year}-${String(loan.first_deduction_month).padStart(2,'0')}.` }
}

async function rejectLoanTool(input) {
  await _requireAdmin()
  if (!input.loan_id) throw new Error('loan_id required')
  if (!input.decision_note) throw new Error('decision_note required when rejecting')
  const { error } = await supabase.from('hr_loan_requests').update({
    status: 'rejected',
    approved_at: new Date().toISOString(),
    decision_note: input.decision_note,
  }).eq('id', input.loan_id).eq('status', 'submitted')
  if (error) throw new Error(`reject failed: ${error.message}`)
  await revalidate(['/hr/loans'])
  return { rejected: true, id: input.loan_id }
}

async function myLoansTool() {
  const emp = await _resolveSelfOrThrow()
  const { data } = await supabase.from('hr_loan_requests')
    .select('id, amount, currency, reason, term_months, monthly_deduction, status, decision_note, amount_repaid, created_at, first_deduction_year, first_deduction_month')
    .eq('employee_id', emp.id).order('created_at', { ascending: false })
  return { employee_name: emp.full_name, rows: data ?? [] }
}

// =============================================================================
// SICK LEAVE WITH DOCTOR NOTE
// Convenience wrapper around request_leave_for_self that attaches a medical
// certificate PDF/image (uploaded via WA) and auto-drafts the sick_leave_notice
// letter.
// =============================================================================

async function submitSickLeaveTool(input) {
  const emp = await _resolveSelfOrThrow()
  const start = String(input.start_date), end = String(input.end_date || input.start_date)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    throw new Error('start_date / end_date must be ISO YYYY-MM-DD.')
  }
  const days = _daysBetween(start, end)
  if (days < 1) throw new Error('end_date must be on or after start_date.')

  // Create the leave_requests row with the attachment fields populated
  const { data: leave, error } = await supabase.from('leave_requests').insert({
    employee_id: emp.id,
    type: 'sick',
    start_date: start, end_date: end, days,
    status: 'pending',
    reason: input.reason || 'Illness',
    attachment_url: input.doctor_note_url || null,
    attachment_name: input.doctor_note_filename || (input.doctor_note_url ? 'doctor-note' : null),
  }).select('id').single()
  if (error) throw new Error(`sick leave failed: ${error.message}`)

  // Generate the formal sick-leave notice letter
  const { data: empFull } = await supabase
    .from('team_members')
    .select('id, full_name, full_name_ar, job_title, job_title_ar, department, hire_date, base_salary, salary_currency, iqama_number, national_id')
    .eq('id', emp.id).maybeSingle()
  const refs = KSA_LABOUR_LAW_CLAUSES['sick_leave_notice']
  const meta = {
    start_date: start, end_date: end, days,
    doctor_note_url: input.doctor_note_url || null,
  }
  const bodies = _renderLetterBody('sick_leave_notice', empFull,
    `Sick leave — ${emp.full_name} — ${start} to ${end}`,
    input.reason, refs, new Date().toISOString().slice(0, 10), meta)
  await supabase.from('hr_letters').insert({
    employee_id: emp.id,
    letter_type: 'sick_leave_notice',
    subject: `Sick leave — ${emp.full_name} — ${start} to ${end}`,
    body_en: bodies.en, body_ar: bodies.ar,
    reference_clauses: refs, status: 'draft', meta,
  })

  // Admin notification
  await supabase.from('notifications').insert({
    user_id: null,
    title: `Sick leave: ${emp.full_name}`,
    message: `${emp.full_name} reported sick leave ${start} → ${end} (${days}d).${input.doctor_note_url ? ' Doctor note attached.' : ''} Review at /hr/leaves.`,
    type: 'sick_leave',
    related_id: leave.id,
    is_read: false,
  }).catch(() => null)

  await revalidate(['/hr', '/notifications'])
  return {
    submitted: true,
    leave_id: leave.id,
    employee_name: emp.full_name,
    days, start, end,
    has_doctor_note: !!input.doctor_note_url,
    message: `Sick-leave notice recorded (${days} day${days === 1 ? '' : 's'}). ${input.doctor_note_url ? 'Doctor note attached. ' : 'Submit doctor note when you can. '}HR has been notified.`,
  }
}

async function myLettersTool() {
  const emp = await _resolveSelfOrThrow()
  const { data } = await supabase
    .from('hr_letters')
    .select('id, letter_type, subject, status, delivered_at, created_at')
    .eq('employee_id', emp.id)
    .order('created_at', { ascending: false }).limit(20)
  return { employee_name: emp.full_name, rows: data ?? [] }
}

async function myDocumentsTool() {
  const emp = await _resolveSelfOrThrow()
  const { data } = await supabase
    .from('hr_documents')
    .select('id, doc_type, doc_number, issue_date, expiry_date, file_url, notes')
    .eq('employee_id', emp.id)
    .order('expiry_date', { ascending: true, nullsFirst: false })
  return { employee_name: emp.full_name, rows: data ?? [] }
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
  // accounting (bills / expenses)
  create_draft_bill: createDraftBillTool,
  find_bills: findBillsTool,
  approve_bill: approveBillTool,
  push_bill: pushBillTool,
  suggest_bill_category: suggestBillCategoryTool,
  // overdue-invoice nags
  find_pending_nags: findPendingNagsTool,
  send_nag: sendNagTool,
  skip_nag: skipNagTool,
  // HR — leave + conflict
  request_leave_for_self: requestLeaveForSelfTool,
  find_leave_requests: findLeaveRequestsTool,
  approve_leave: approveLeaveTool,
  reject_leave: rejectLeaveTool,
  check_leave_conflicts: checkLeaveConflictsTool,
  // HR — payroll + EOSB
  generate_payroll: generatePayrollTool,
  mark_payroll_paid: markPayrollPaidTool,
  find_payroll: findPayrollTool,
  compute_eosb: computeEosbTool,
  // HR — salary slip
  send_salary_slip: sendSalarySlipTool,
  // HR — onboarding
  start_onboarding: startOnboardingTool,
  mark_onboarding_item_done: markOnboardingItemDoneTool,
  // HR — performance brief
  performance_brief: performanceBriefTool,
  // HR — attendance
  log_attendance: logAttendanceTool,
  attendance_report: attendanceReportTool,
  // HR — candidates
  add_candidate: addCandidateTool,
  find_candidates: findCandidatesTool,
  promote_candidate_to_employee: promoteCandidateTool,
  // HR — letters
  draft_hr_letter: draftHrLetterTool,
  // HR — documents
  add_hr_document: addHrDocumentTool,
  find_hr_documents: findHrDocumentsTool,
  // HR — EMPLOYEE SELF-SERVICE (always scoped to the caller)
  my_expiries: myExpiriesTool,
  my_leaves: myLeavesTool,
  my_leave_balance: myLeaveBalanceTool,
  my_payroll: myPayrollTool,
  my_pay_breakdown: myPayBreakdownTool,
  my_eosb: myEosbTool,
  request_my_salary_slip: requestMySalarySlipTool,
  my_onboarding: myOnboardingTool,
  complete_my_onboarding_item: completeMyOnboardingItemTool,
  my_performance: myPerformanceTool,
  my_attendance: myAttendanceTool,
  request_hr_letter: requestHrLetterTool,
  my_letters: myLettersTool,
  my_documents: myDocumentsTool,
  // HR — loans + sick leave
  request_loan: requestLoanTool,
  find_loans: findLoansTool,
  approve_loan: approveLoanTool,
  reject_loan: rejectLoanTool,
  my_loans: myLoansTool,
  submit_sick_leave: submitSickLeaveTool,
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
