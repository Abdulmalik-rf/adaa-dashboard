import { supabase } from '../supabase.js'
import { revalidate } from '../revalidate.js'
import { rememberFact, forgetFact } from '../memory-store.js'
import { generateQuotationPdf } from '../quotation-pdf.js'
import { getSock, isReady } from '../sock-holder.js'
import { getRequest } from '../context.js'

// =============================================================================
// HELPERS
// =============================================================================

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
  const notify_jid = getRequest()?.senderJid ?? null

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

async function createWeeklyReport(input) {
  const client_id = await resolveClientIdByName(input.client_company_name)
  // We always store, even if the client wasn't matched — the user can fix later.
  const period_end = input.period_end || new Date().toISOString().split('T')[0]
  const period_start = input.period_start || lastMondayISO()
  const report_number = await nextReportNumber()

  const row = {
    report_number,
    client_id,
    client_name_snapshot: input.client_company_name,
    period_start,
    period_end,
    issue_date: new Date().toISOString().split('T')[0],
    summary: input.summary ?? null,
    notes: input.notes ?? null,
    prepared_for_contact: input.prepared_for_contact ?? null,
    prepared_for_meta: input.prepared_for_meta ?? null,
    prepared_for_email: input.prepared_for_email ?? null,
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
    .select('id, report_number, client_name_snapshot, period_start, period_end, status')
    .or(
      `report_number.ilike.%${input.query}%,client_name_snapshot.ilike.%${input.query}%`,
    )
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) throw new Error(`weekly_reports search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateWeeklyReport(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, [
    'period_start', 'period_end', 'summary', 'notes',
    'prepared_for_contact', 'prepared_for_meta', 'prepared_for_email', 'status',
  ])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
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

// ---- Section appenders -----------------------------------------------------
async function addReportKpi(input) {
  return appendJsonArray(input.report_id, 'kpis', {
    label: input.label,
    value: input.value,
    delta_label: input.delta_label ?? null,
    delta_direction: input.delta_direction ?? 'flat',
  })
}
async function removeReportKpi(input) {
  return removeJsonArrayAt(input.report_id, 'kpis', input.index)
}

async function addReportPlatform(input) {
  return appendJsonArray(input.report_id, 'platforms', {
    platform: input.platform,
    dot_color: input.dot_color ?? null,
    followers: input.followers ?? null,
    delta_followers: input.delta_followers ?? null,
    posts_count: input.posts_count ?? null,
    reach: input.reach ?? null,
    engagement_rate: input.engagement_rate ?? null,
  })
}
async function removeReportPlatform(input) {
  return removeJsonArrayAt(input.report_id, 'platforms', input.index)
}

async function addReportContent(input) {
  return appendJsonArray(input.report_id, 'content_items', {
    title: input.title,
    platform: input.platform ?? null,
    content_type: input.content_type ?? null,
    campaign_label: input.campaign_label ?? null,
    publish_date: input.publish_date ?? null,
    media_url: input.media_url ?? null,
    status: input.status ?? 'published',
  })
}
async function removeReportContent(input) {
  return removeJsonArrayAt(input.report_id, 'content_items', input.index)
}

async function addReportCampaign(input) {
  return appendJsonArray(input.report_id, 'campaigns', {
    name: input.name,
    platform: input.platform ?? null,
    objective: input.objective ?? null,
    spend: input.spend ?? null,
    currency: input.currency ?? 'SAR',
    result: input.result ?? null,
    status: input.status ?? 'live',
  })
}
async function removeReportCampaign(input) {
  return removeJsonArrayAt(input.report_id, 'campaigns', input.index)
}

async function addReportTask(input) {
  const column = input.kind === 'plan' ? 'tasks_plan' : 'tasks_done'
  return appendJsonArray(input.report_id, column, {
    title: input.title,
    owner: input.owner ?? null,
    date_label: input.date_label ?? null,
  })
}
async function removeReportTask(input) {
  const column = input.kind === 'plan' ? 'tasks_plan' : 'tasks_done'
  return removeJsonArrayAt(input.report_id, column, input.index)
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

  const { generateWeeklyReportPdf } = await import('../weekly-report-pdf.js')
  const pdf = await generateWeeklyReportPdf(report)
  const { sock, userJid } = getSock()

  const fileName = `${report.report_number}.pdf`
  await sock.sendMessage(userJid, {
    document: pdf,
    mimetype: 'application/pdf',
    fileName,
    caption: `${report.report_number} — ${report.client_name_snapshot ?? 'weekly report'}`,
  })

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
  // client services
  add_client_service: addClientService,
  remove_client_service: removeClientService,
  list_client_services: listClientServices,
  // notifications
  find_notifications: findNotifications,
  mark_notification_read: markNotificationRead,
  mark_all_notifications_read: markAllNotificationsRead,
  delete_notification: deleteNotification,
  // content items (social media posts)
  add_content_item: addContentItem,
  find_content_item: findContentItem,
  update_content_item: updateContentItem,
  delete_content_item: deleteContentItem,
  // client files
  list_client_files: listClientFiles,
  add_client_file_link: addClientFileLink,
  delete_client_file: deleteClientFile,
  // agency settings
  get_agency_settings: getAgencySettings,
  update_agency_settings: updateAgencySettings,
  // weekly reports
  create_weekly_report: createWeeklyReport,
  find_weekly_report: findWeeklyReport,
  update_weekly_report: updateWeeklyReport,
  delete_weekly_report: deleteWeeklyReport,
  add_report_kpi: addReportKpi,
  remove_report_kpi: removeReportKpi,
  add_report_platform: addReportPlatform,
  remove_report_platform: removeReportPlatform,
  add_report_content: addReportContent,
  remove_report_content: removeReportContent,
  add_report_campaign: addReportCampaign,
  remove_report_campaign: removeReportCampaign,
  add_report_task: addReportTask,
  remove_report_task: removeReportTask,
  upload_image: uploadImage,
  send_weekly_report_pdf: sendWeeklyReportPdf,
}

export async function runTool(name, input) {
  const fn = registry[name]
  if (!fn) throw new Error(`unknown tool: ${name}`)
  return await fn(input)
}
