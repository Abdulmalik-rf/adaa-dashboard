import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const dbPath = path.join(process.cwd(), 'db.json')

const getDb = () => {
  if (!fs.existsSync(dbPath)) {
    const seed = createSeed()
    fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2))
    return seed
  }
  try {
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'))
  } catch {
    const seed = createSeed()
    fs.writeFileSync(dbPath, JSON.stringify(seed, null, 2))
    return seed
  }
}

function createSeed() {
  const now = new Date().toISOString()
  return {
    clients: [
      { id: 'c1', full_name: 'Ahmed Youssef', company_name: 'TechNova Solutions', phone: '+966500000001', email: 'ahmed@technova.sa', whatsapp: '+966500000001', city: 'Riyadh', business_type: 'Technology', status: 'active', start_date: '2024-01-15', notes: 'Long-term client, premium package.', created_at: now },
      { id: 'c2', full_name: 'Sarah Al-Saud', company_name: 'Elegance Fashion', phone: '+966500000002', email: 'sarah@elegance.sa', whatsapp: '+966500000002', city: 'Jeddah', business_type: 'Fashion & Retail', status: 'active', start_date: '2024-03-01', notes: 'Focus on Instagram and TikTok.', created_at: now },
      { id: 'c3', full_name: 'Khalid Ibrahim', company_name: 'AlRawabi Real Estate', phone: '+966500000003', email: 'khalid@alrawabi.sa', whatsapp: '+966500000003', city: 'Riyadh', business_type: 'Real Estate', status: 'lead', start_date: '2024-06-10', notes: '', created_at: now },
      { id: 'c4', full_name: 'Fatima Nasser', company_name: 'Bloom Restaurant', phone: '+966500000004', email: 'fatima@bloom.sa', whatsapp: '+966500000004', city: 'Dammam', business_type: 'Food & Beverage', status: 'paused', start_date: '2023-11-01', notes: 'Paused during ramadan season.', created_at: now },
    ],
    client_services: [
      { id: 'cs1', client_id: 'c1', service_name: 'Social Media Management', created_at: now },
      { id: 'cs2', client_id: 'c1', service_name: 'Google Ads', created_at: now },
      { id: 'cs3', client_id: 'c1', service_name: 'SEO', created_at: now },
      { id: 'cs4', client_id: 'c2', service_name: 'Social Media Management', created_at: now },
      { id: 'cs5', client_id: 'c2', service_name: 'Content Production', created_at: now },
      { id: 'cs6', client_id: 'c3', service_name: 'Google Ads', created_at: now },
    ],
    social_accounts: [
      { id: 'sa1', client_id: 'c1', platform: 'instagram', account_name: 'TechNova Insta', username: 'technova_sa', email: 'social@technova.sa', encrypted_password: 'mock_encrypted_secret', external_id: null, is_default: true, followers: 12400, status: 'active', notes: 'Main business channel', updated_at: now, created_at: now },
      { id: 'sa2', client_id: 'c1', platform: 'tiktok', account_name: 'TechNova Official', username: 'technova.sa', email: 'tiktok@technova.sa', encrypted_password: 'mock_encrypted_secret', external_id: 'tt_1234567890', is_default: true, followers: 3200, status: 'active', notes: 'Growth channel', updated_at: now, created_at: now },
      { id: 'sa3', client_id: 'c2', platform: 'instagram', account_name: 'Elegance Fashion IG', username: 'elegance.fashion', email: 'hello@elegance.sa', encrypted_password: 'mock_encrypted_secret', external_id: null, is_default: true, followers: 48700, status: 'active', notes: '', updated_at: now, created_at: now },
      { id: 'sa4', client_id: 'c2', platform: 'snapchat', account_name: 'Elegance Snaps', username: 'elegance_sa', email: 'snap@elegance.sa', encrypted_password: 'mock_encrypted_secret', external_id: 'snap_uuid_898', is_default: true, followers: 2100, status: 'active', notes: 'High engagement', updated_at: now, created_at: now },
      { id: 'sa5', client_id: 'c1', platform: 'google_ads', account_name: 'TechNova Ad Manager', username: null, email: 'ads@technova.sa', encrypted_password: null, external_id: '123-456-7890', is_default: true, followers: null, status: 'active', notes: 'Google Ads MCC ID', updated_at: now, created_at: now },
    ],
    contracts: [
      { id: 'con1', client_id: 'c1', title: 'Annual Social Media Management', contract_type: 'retainer', value: 36000, currency: 'SAR', start_date: '2024-01-01', end_date: '2024-12-31', status: 'active', payment_cycle: 'monthly', notes: 'Includes all platforms.', created_at: now },
      { id: 'con2', client_id: 'c2', title: 'Q4 Content Production Package', contract_type: 'project', value: 15000, currency: 'SAR', start_date: '2024-10-01', end_date: '2024-12-31', status: 'ending_soon', payment_cycle: 'one-time', notes: '', created_at: now },
      { id: 'con3', client_id: 'c3', title: 'Google Ads Campaign Setup', contract_type: 'project', value: 8000, currency: 'SAR', start_date: '2024-06-01', end_date: '2024-09-30', status: 'expired', payment_cycle: 'one-time', notes: 'Needs renewal discussion.', created_at: now },
    ],
    reminders: [
      { id: 'r1', client_id: 'c2', title: 'Contract Renewal Discussion', type: 'contract', priority: 'high', due_date: '2024-12-01', status: 'pending', notes: 'Call Sarah to discuss Q1 2025 plan.', created_at: now },
      { id: 'r2', client_id: 'c1', title: 'Monthly Performance Report', type: 'report', priority: 'medium', due_date: '2024-11-30', status: 'pending', notes: 'Prepare November analytics.', created_at: now },
      { id: 'r3', client_id: 'c3', title: 'Follow-up on Proposal', type: 'call', priority: 'high', due_date: '2024-11-20', status: 'completed', notes: '', created_at: now },
    ],
    client_files: [
      { id: 'f1', client_id: 'c1', name: 'Brand Guidelines 2024.pdf', category: 'Branding', size: 2457600, file_type: 'pdf', storage_path: '/files/c1/brand_guidelines.pdf', uploaded_by: 'tm1', created_at: now },
      { id: 'f2', client_id: 'c1', name: 'Q3 Performance Report.xlsx', category: 'Reports', size: 512000, file_type: 'xlsx', storage_path: '/files/c1/q3_report.xlsx', uploaded_by: 'tm1', created_at: now },
      { id: 'f3', client_id: 'c2', name: 'Product Catalog.pdf', category: 'Products', size: 8192000, file_type: 'pdf', storage_path: '/files/c2/catalog.pdf', uploaded_by: 'tm2', created_at: now },
    ],
    content_items: [
      { id: 'ci1', client_id: 'c1', platform: 'instagram', content_type: 'reel', title: 'Tech Tips: 5 AI Tools for 2025', caption: 'Revolutionize your workflow with these amazing AI tools! 🚀 Which one is your favourite? Drop a comment below! #TechTips #AI #Productivity', hashtags: '#tech #ai #productivity #digital #innovation #2025 #trending', publish_date: '2024-12-05', publish_time: '18:00', timezone: 'Asia/Riyadh', schedule_status: 'approved', task_status: 'in_progress', assignee_id: 'tm2', media_url: null, thumbnail_url: null, created_at: now },
      { id: 'ci2', client_id: 'c2', platform: 'tiktok', content_type: 'video', title: 'Unboxing: Winter Collection 2024', caption: 'POV: when the winter collection just landed 🔥❄️ Swipe to see the full look!', hashtags: '#fashion #winter #ootd #fyp #viral #trending #unboxing', publish_date: '2024-12-07', publish_time: '12:00', timezone: 'Asia/Riyadh', schedule_status: 'scheduled', task_status: 'not_started', assignee_id: 'tm2', media_url: null, thumbnail_url: null, created_at: now },
      { id: 'ci3', client_id: 'c1', platform: 'google_ads', content_type: 'ad', title: 'TechNova – Cloud Solutions Ad', caption: 'Secure, scalable cloud infrastructure for your business. Get started free today.', hashtags: 'cloud solutions, business software, IT services, tech company riyadh', publish_date: '2024-12-01', publish_time: '08:00', timezone: 'Asia/Riyadh', schedule_status: 'published', task_status: 'completed', assignee_id: 'tm3', media_url: null, thumbnail_url: null, created_at: now },
      { id: 'ci4', client_id: 'c2', platform: 'snapchat', content_type: 'story', title: 'Friday Sale Alert!', caption: 'Hey! Big sale this Friday only 👀 Don\'t miss out – tap to shop!', hashtags: '#sale #fashion #friday', publish_date: '2024-12-06', publish_time: '10:00', timezone: 'Asia/Riyadh', schedule_status: 'draft', task_status: 'not_started', assignee_id: 'tm2', media_url: null, thumbnail_url: null, created_at: now },
    ],
    notifications: [
      { id: 'n1', title: 'Welcome to AgencyOS', message: 'Your agency operations platform is ready. Start by adding clients!', type: 'system', related_id: null, user_id: null, is_read: false, created_at: now },
      { id: 'n2', title: 'Contract Ending Soon', message: 'Q4 Content Production Package for Elegance Fashion ends in 30 days.', type: 'contract_alert', related_id: 'con2', user_id: null, is_read: false, created_at: now },
      { id: 'n3', title: 'Task Assigned', message: 'You have been assigned: Tech Tips: 5 AI Tools for 2025', type: 'task_assigned', related_id: 'ci1', user_id: 'tm2', is_read: false, created_at: now },
    ],
    ad_campaigns: [
      { id: 'ac1', client_id: 'c1', name: 'Brand Awareness Q4', platform: 'google_ads', budget: 5000, spent: 2340, status: 'active', start_date: '2024-10-01', end_date: '2024-12-31', impressions: 142000, clicks: 3800, conversions: 124, created_at: now },
    ],
    communication_logs: [
      { id: 'cl1', client_id: 'c1', type: 'call', summary: 'Monthly check-in call', notes: 'Client happy with performance. Discussed Q1 plan.', date: '2024-11-15', created_by: 'tm1', created_at: now },
      { id: 'cl2', client_id: 'c2', type: 'email', summary: 'Contract renewal proposal sent', notes: 'Awaiting response.', date: '2024-11-18', created_by: 'tm1', created_at: now },
    ],
    team_members: [
      { id: 'tm1', full_name: 'Fahad Al-Dossari', role: 'admin', job_title: 'CEO / Account Director', email: 'fahad@agency.sa', phone: '+966500000010', whatsapp: '+966500000010', status: 'active', avatar_initials: 'FA', created_at: now },
      { id: 'tm2', full_name: 'Noura Salem', role: 'staff', job_title: 'Social Media Specialist', email: 'noura@agency.sa', phone: '+966500000011', whatsapp: '+966500000011', status: 'active', avatar_initials: 'NS', created_at: now },
      { id: 'tm3', full_name: 'Omar Ziad', role: 'manager', job_title: 'Digital Marketing Manager', email: 'omar@agency.sa', phone: '+966500000012', whatsapp: '+966500000012', status: 'active', avatar_initials: 'OZ', created_at: now },
      { id: 'tm4', full_name: 'Layla Hassan', role: 'staff', job_title: 'Graphic Designer', email: 'layla@agency.sa', phone: '+966500000013', whatsapp: '+966500000013', status: 'active', avatar_initials: 'LH', created_at: now },
    ],
    tasks: [
      { id: 'task1', client_id: 'c1', assignee_id: 'tm3', title: 'Setup Google Ads Q1 2025 Campaign', description: 'Configure campaigns, ad groups, and keyword targeting for TechNova Q1 push.', priority: 'high', status: 'in_progress', due_date: '2024-12-15', completed_at: null, created_at: now },
      { id: 'task2', client_id: 'c2', assignee_id: 'tm2', title: 'Schedule Winter Collection Content (12 posts)', description: 'Review, caption, and schedule all 12 posts for the winter launch.', priority: 'medium', status: 'todo', due_date: '2024-12-10', completed_at: null, created_at: now },
      { id: 'task3', client_id: 'c1', assignee_id: 'tm1', title: 'Send Contract Renewal Proposal', description: 'Prepare and send the 2025 retainer contract to Ahmed for review.', priority: 'urgent', status: 'todo', due_date: '2024-12-01', completed_at: null, created_at: now },
      { id: 'task4', client_id: 'c3', assignee_id: 'tm3', title: 'AlRawabi – Site Technical SEO Audit', description: 'Run Lighthouse, Screaming Frog, and SEMrush audit. Deliver report.', priority: 'medium', status: 'review', due_date: '2024-12-20', completed_at: null, created_at: now },
      { id: 'task5', client_id: 'c1', assignee_id: 'tm2', title: 'November Performance Report', description: 'Compile analytics from Meta, Google, TikTok into monthly report.', priority: 'medium', status: 'completed', due_date: '2024-11-30', completed_at: now, created_at: now },
    ]
  }
}

const saveDb = (data: any) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2))
}

type FilterCondition = { col: string; val: any; op: string }

class MockSupabaseQueryBuilder {
  table: string
  queryType: string = 'select'
  insertData: any = null
  conditions: FilterCondition[] = []
  orderData: { col: string; options: any } | null = null
  limitNum: number | null = null
  selectFields: string = '*'

  constructor(table: string) {
    this.table = table
  }

  update(data: any) {
    this.queryType = 'update'
    this.insertData = data
    return this
  }

  select(fields: string = '*') {
    if (this.queryType !== 'insert' && this.queryType !== 'update' && this.queryType !== 'delete') {
      this.queryType = 'select'
    }
    this.selectFields = fields
    return this
  }

  insert(data: any) {
    this.queryType = 'insert'
    this.insertData = data
    return this
  }

  delete() {
    this.queryType = 'delete'
    return this
  }

  upsert(data: any) {
    this.queryType = 'upsert'
    this.insertData = data
    return this
  }

  eq(col: string, val: any) {
    this.conditions.push({ col, val, op: 'eq' })
    return this
  }

  neq(col: string, val: any) {
    this.conditions.push({ col, val, op: 'neq' })
    return this
  }

  ilike(col: string, val: any) {
    this.conditions.push({ col, val, op: 'ilike' })
    return this
  }

  or(filterStr: string) {
    this.conditions.push({ col: '__or__', val: filterStr, op: 'or' })
    return this
  }

  gte(col: string, val: any) {
    this.conditions.push({ col, val, op: 'gte' })
    return this
  }

  lte(col: string, val: any) {
    this.conditions.push({ col, val, op: 'lte' })
    return this
  }

  order(col: string, options: any = {}) {
    this.orderData = { col, options }
    return this
  }

  limit(n: number) {
    this.limitNum = n
    return this
  }

  async single() {
    const res = await this.execute()
    if (res.data && Array.isArray(res.data) && res.data.length > 0) {
      return { data: res.data[0], error: null }
    }
    return { data: null, error: res.error }
  }

  applyConditions(items: any[]): any[] {
    let result = [...items]
    for (const cond of this.conditions) {
      if (cond.op === 'eq') result = result.filter(r => r[cond.col] === cond.val)
      else if (cond.op === 'neq') result = result.filter(r => r[cond.col] !== cond.val)
      else if (cond.op === 'gte') result = result.filter(r => r[cond.col] >= cond.val)
      else if (cond.op === 'lte') result = result.filter(r => r[cond.col] <= cond.val)
      else if (cond.op === 'ilike') {
        const pattern = cond.val.replace(/%/g, '').toLowerCase()
        result = result.filter(r => String(r[cond.col] || '').toLowerCase().includes(pattern))
      } else if (cond.op === 'or') {
        // Parse simple or filters: "col.ilike.%val%,col2.ilike.%val2%"
        const parts = cond.val.split(',')
        result = result.filter(r => parts.some((part: string) => {
          const [col, op, rawVal] = part.split('.')
          const val = rawVal?.replace(/%/g, '').toLowerCase()
          if (op === 'ilike') return String(r[col] || '').toLowerCase().includes(val)
          if (op === 'eq') return String(r[col]) === rawVal
          return false
        }))
      }
    }
    return result
  }

  async execute(): Promise<{ data: any; error: any }> {
    const db = getDb()
    let tableData = db[this.table] || []

    if (this.queryType === 'insert') {
      const records = Array.isArray(this.insertData) ? this.insertData : [this.insertData]
      const newRecords = records.map((r: any) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...r
      }))
      db[this.table] = [...tableData, ...newRecords]
      saveDb(db)
      return { data: newRecords, error: null }
    }

    if (this.queryType === 'delete') {
      const toDelete = this.applyConditions(tableData)
      const idsToDelete = new Set(toDelete.map((r: any) => r.id))
      db[this.table] = tableData.filter((r: any) => !idsToDelete.has(r.id))
      saveDb(db)
      return { data: toDelete, error: null }
    }

    if (this.queryType === 'update') {
      const matched = this.applyConditions(tableData)
      const idsToUpdate = new Set(matched.map((r: any) => r.id))
      db[this.table] = tableData.map((r: any) => {
        if (idsToUpdate.has(r.id)) {
          return { ...r, ...this.insertData, updated_at: new Date().toISOString() }
        }
        return r
      })
      saveDb(db)
      return { data: db[this.table].filter((r: any) => idsToUpdate.has(r.id)), error: null }
    }

    if (this.queryType === 'upsert') {
      const records = Array.isArray(this.insertData) ? this.insertData : [this.insertData]
      for (const record of records) {
        const existing = tableData.find((r: any) => r.id === record.id)
        if (existing) {
          db[this.table] = tableData.map((r: any) => r.id === record.id ? { ...r, ...record, updated_at: new Date().toISOString() } : r)
        } else {
          db[this.table] = [...(db[this.table] || []), { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...record }]
        }
        tableData = db[this.table]
      }
      saveDb(db)
      return { data: records, error: null }
    }

    if (this.queryType === 'select') {
      let result = this.applyConditions(tableData)

      // Mock relational joins
      result = result.map(r => {
        let enriched = { ...r }

        // Join clients
        if (r.client_id && db['clients']) {
          const client = db['clients'].find((c: any) => c.id === r.client_id)
          enriched.clients = client || null
        }

        // Join team members as assignee
        if (r.assignee_id && db['team_members']) {
          const member = db['team_members'].find((m: any) => m.id === r.assignee_id)
          enriched.team_members = member || null
        }

        return enriched
      })

      // Add sub-relations for clients table
      if (this.table === 'clients') {
        result = result.map(r => ({
          ...r,
          client_services: (db['client_services'] || []).filter((s: any) => s.client_id === r.id),
          social_accounts: (db['social_accounts'] || []).filter((s: any) => s.client_id === r.id),
        }))
      }

      if (this.orderData) {
        result.sort((a, b) => {
          const aVal = a[this.orderData!.col]
          const bVal = b[this.orderData!.col]
          if (aVal < bVal) return this.orderData!.options?.ascending ? -1 : 1
          if (aVal > bVal) return this.orderData!.options?.ascending ? 1 : -1
          return 0
        })
      }

      if (this.limitNum !== null) {
        result = result.slice(0, this.limitNum)
      }

      return { data: result, error: null }
    }

    return { data: null, error: null }
  }

  then(onfulfilled?: (value: any) => any, onrejected?: (reason: any) => any) {
    return this.execute().then(onfulfilled, onrejected)
  }
}

// Storage mock
const mockStorage = {
  from: (bucket: string) => ({
    upload: async (path: string, file: any) => ({ data: { path }, error: null }),
    download: async (path: string) => ({ data: null, error: null }),
    remove: async (paths: string[]) => ({ data: paths, error: null }),
    getPublicUrl: (path: string) => ({ data: { publicUrl: `/api/files/${path}` } }),
    createSignedUrl: async (path: string, expires: number) => ({ data: { signedUrl: `/api/files/${path}?expires=${expires}` }, error: null }),
    list: async (folder: string) => ({ data: [], error: null }),
  })
}

export const mockSupabaseClient = {
  from: (table: string) => new MockSupabaseQueryBuilder(table),
  storage: mockStorage,
}
