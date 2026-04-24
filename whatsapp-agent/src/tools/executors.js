import { supabase } from '../supabase.js'
import { revalidate } from '../revalidate.js'

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
  if (input.client_company_name && !client_id) {
    return { warning: `no client matched "${input.client_company_name}". Reminder not linked.` }
  }
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
  return { id: data.id, title: data.title, due_date: data.due_date, linked_client_id: client_id }
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
  const row = {
    title: input.title,
    description: input.description ?? null,
    priority: input.priority ?? 'medium',
    status: 'todo',
    client_id,
    assignee_id,
    due_date: input.due_date ?? null,
  }
  const { data, error } = await supabase.from('tasks').insert(row).select().single()
  if (error) throw new Error(`insert tasks failed: ${error.message}`)
  const paths = ['/tasks', '/my-tasks', '/my-dashboard', '/']
  if (client_id) paths.push(`/clients/${client_id}`)
  await revalidate(paths)
  return { id: data.id, title: data.title, linked_client_id: client_id, assignee_id }
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
  const patch = pickDefined(rest, ['title', 'description', 'priority', 'status', 'due_date'])
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
    'status', 'value', 'notes',
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
// REGISTRY
// =============================================================================

const registry = {
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
