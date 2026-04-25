// @ts-nocheck — ported from the JS agent, types kept loose to avoid a huge
// refactor. `input` params are shaped by the OpenAI tool schema at runtime.
import { revalidatePath } from 'next/cache'
import { agentSupabase } from '../supabase'

// Lazy proxy — agentSupabase() is called on first property access, so build-
// time imports of this file don't throw if env vars aren't set yet.
const supabase: any = new Proxy(
  {},
  { get: (_t, prop) => (agentSupabase() as any)[prop] },
)

// In-process replacement for the WhatsApp agent's HTTP revalidate hop —
// this code runs inside the Next.js server, so we can call the cache hook
// directly.
async function revalidate(paths: string[]) {
  for (const p of paths) {
    try { revalidatePath(p) } catch {}
  }
}

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
    .from('contracts').select('id').ilike('title', `%${title}%`)
    .order('created_at', { ascending: false }).limit(1)
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

  const row = {
    client_id,
    title: input.title,
    description: input.description ?? null,
    type: input.type,
    due_date: input.due_date,
    due_time: input.due_time ?? null,
    priority: input.priority ?? 'medium',
    status: 'pending',
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
    id: data.id, title: data.title,
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
  const patch: any = pickDefined(rest, ['title', 'description', 'priority', 'status', 'due_date'])
  if ('contract_id' in rest) patch.contract_id = rest.contract_id || null
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

async function addSocialAccount(input) {
  const row = {
    client_id: input.client_id,
    platform: input.platform,
    username: input.username ?? null,
    url: input.url ?? null,
    notes: input.notes ?? null,
    status: input.status ?? 'active',
  }
  const { data, error } = await supabase.from('social_accounts').insert(row).select().single()
  if (error) throw new Error(`insert social_accounts failed: ${error.message}`)
  await revalidate([`/clients/${input.client_id}`])
  return { id: data.id, platform: data.platform, username: data.username }
}

async function findSocialAccount(input) {
  let q = supabase
    .from('social_accounts')
    .select('id, platform, username, url, status, client_id')
    .eq('client_id', input.client_id)
  if (input.platform) q = q.eq('platform', input.platform)
  const { data, error } = await q
  if (error) throw new Error(`social_accounts search failed: ${error.message}`)
  return { matches: data ?? [] }
}

async function updateSocialAccount(input) {
  const { id, ...rest } = input
  const patch = pickDefined(rest, ['username', 'url', 'notes', 'status'])
  if (Object.keys(patch).length === 0) return { warning: 'no fields to update' }
  const { data, error } = await supabase
    .from('social_accounts').update(patch).eq('id', id).select().single()
  if (error) throw new Error(`update social_accounts failed: ${error.message}`)
  await revalidate([`/clients/${data.client_id}`])
  return { id: data.id, updated_fields: Object.keys(patch), platform: data.platform }
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
    .from('tasks').update({ contract_id }).eq('id', input.task_id).select().single()
  if (error) throw new Error(`link task→contract failed: ${error.message}`)
  if (data.client_id) await revalidate([`/clients/${data.client_id}`])
  return { id: data.id, contract_id: data.contract_id }
}

// =============================================================================
// REGISTRY
// =============================================================================
// NOTE: send_quotation_pdf and long-term memory tools are NOT exposed here —
// PDF gen needs puppeteer (too heavy for Hostinger's shared runtime) and
// long-term memory is specific to the WhatsApp agent.

const registry: Record<string, (input: any) => Promise<any>> = {
  // quotations
  create_quotation: createQuotation,
  add_quotation_item: addQuotationItem,
  find_quotation: findQuotation,
  update_quotation: updateQuotation,
  set_quotation_status: setQuotationStatus,
  remove_quotation_item: removeQuotationItem,
  delete_quotation: deleteQuotationExec,
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
}

export async function runTool(name, input) {
  const fn = registry[name]
  if (!fn) throw new Error(`unknown tool: ${name}`)
  return await fn(input)
}
