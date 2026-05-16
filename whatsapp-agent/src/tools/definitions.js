// OpenAI-format tool definitions, grouped by entity.
// To extend: add a tool block here and a matching executor in executors.js.

// =============================================================================
// CLIENTS
// =============================================================================

const clientsTools = [
  {
    type: 'function',
    function: {
      name: 'add_client',
      description:
        'Add a new client. Only company_name and full_name are required. Use when user says "add client X", "new lead Y", or when extracting a business card from an image.',
      parameters: {
        type: 'object',
        properties: {
          company_name: { type: 'string' },
          full_name: { type: 'string', description: 'Main contact person.' },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          city: { type: 'string' },
          business_type: { type: 'string' },
          status: {
            type: 'string',
            enum: ['to_contact', 'lead', 'active', 'paused', 'completed'],
            description: '"to_contact" = contact captured (e.g. from a business card) but not yet reached out. "lead" = active prospect being worked. Default to "to_contact" for business-card extractions.',
          },
          notes: { type: 'string' },
          website_url: { type: 'string' },
        },
        required: ['company_name', 'full_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_client',
      description:
        'Fuzzy-search clients by company or contact name. Call before update/delete/link operations to get the client id.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_client',
      description: 'Update any client fields. Only include fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          company_name: { type: 'string' },
          full_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          city: { type: 'string' },
          business_type: { type: 'string' },
          status: { type: 'string', enum: ['lead', 'active', 'paused', 'completed'] },
          notes: { type: 'string' },
          website_url: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_client_note',
      description:
        'Append a note to a client\'s running notes log. Non-destructive — the existing notes are preserved and the new entry is prepended with today\'s date. Use this every time the user says "note for X:", "add note to Y", or mentions something worth remembering about a client. Prefer this over update_client({ notes }), which would overwrite the log.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Client UUID.' },
          note: { type: 'string' },
        },
        required: ['id', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_client',
      description:
        'Delete a client and cascade-delete everything linked to them (reminders, contracts, tasks, social accounts, contracts, etc.). DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// REMINDERS
// =============================================================================

const remindersTools = [
  {
    type: 'function',
    function: {
      name: 'add_reminder',
      description:
        'Create a reminder. The agent will send a WhatsApp message at the due date+time — by default to the user who set the reminder, or to notify_phone if specified. Use for "remind me at 3pm", "remind +966555... tomorrow", "follow up on X on Monday", etc.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          due_date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          due_time: {
            type: 'string',
            description:
              'Optional. 24h time HH:MM or HH:MM:SS in the user\'s local timezone. If the user says "at 3pm" use "15:00". If omitted, fires at 09:00 local time on the due date.',
          },
          type: { type: 'string', description: 'e.g. "call", "meeting", "follow_up", "payment".' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          description: { type: 'string' },
          client_company_name: {
            type: 'string',
            description: 'Optional. Company name to link to.',
          },
          notify_phone: {
            type: 'string',
            description:
              'Optional. Phone number to deliver the reminder to (e.g. "+966 55 555 5555", "0577602467", "966577602467"). If omitted, the reminder fires to the user who created it. Use this when the request names a recipient ("remind Ahmad at +9665... on Friday").',
          },
        },
        required: ['title', 'due_date', 'type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_reminder',
      description: 'Fuzzy-search reminders by title.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          only_pending: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_reminder',
      description: 'Update a reminder. Set status to "completed" to mark done.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          type: { type: 'string' },
          due_date: { type: 'string' },
          due_time: { type: 'string', description: '24h HH:MM local time.' },
          priority: { type: 'string', enum: ['low', 'medium', 'high'] },
          status: { type: 'string', enum: ['pending', 'completed'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_reminder',
      description: 'Delete a reminder. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// TASKS
// =============================================================================

const tasksTools = [
  {
    type: 'function',
    function: {
      name: 'add_task',
      description: 'Create a task. Optionally link it to a specific contract by passing contract_title — the executor resolves it to contract_id. Tasks linked to a contract show up under that contract\'s "Delivery schedule" on the client page.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_date: { type: 'string' },
          client_company_name: { type: 'string' },
          contract_title: {
            type: 'string',
            description: 'Optional. Title (or substring) of the contract this task delivers. Resolved to contract_id server-side.',
          },
          assignee_name: {
            type: 'string',
            description: 'Optional. Team member full name to assign this task to.',
          },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_task',
      description: 'Fuzzy-search tasks by title.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          only_open: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_task',
      description: 'Update a task. Set status to "completed" to mark done. Pass contract_id (or null to unlink) to change which contract the task delivers. Pass assignee_name to reassign — agent resolves to assignee_id.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'completed'] },
          due_date: { type: 'string' },
          contract_id: { type: 'string', description: 'Link this task to a contract id, or pass null to unlink.' },
          assignee_name: {
            type: 'string',
            description: 'Reassign to this team member (resolved by name). Pass an empty string to unassign.',
          },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_task',
      description: 'Delete a task. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// CONTRACTS
// =============================================================================

const contractsTools = [
  {
    type: 'function',
    function: {
      name: 'add_contract',
      description: 'Create a contract for a client. The agent must resolve the client company name to an id using find_client first, then pass client_id here.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          title: { type: 'string' },
          contract_type: { type: 'string', description: 'e.g. "retainer", "project", "marketing".' },
          start_date: { type: 'string', description: 'ISO YYYY-MM-DD.' },
          end_date: { type: 'string', description: 'ISO YYYY-MM-DD.' },
          renewal_date: { type: 'string' },
          status: {
            type: 'string',
            enum: ['unsigned', 'active', 'expired', 'ending_soon', 'renewed'],
          },
          value: { type: 'number', description: 'Contract value in the agency\'s currency.' },
          notes: { type: 'string', description: 'Short note (one liner).' },
          scope: { type: 'string', description: 'Long-form description of what the contract covers — appears on the client detail page under "What this covers". Use multiple sentences.' },
          file_url: { type: 'string', description: 'Public URL to the signed contract PDF (Supabase storage, Google Drive share link, etc.).' },
        },
        required: ['client_id', 'title', 'contract_type', 'start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_contract',
      description: 'Fuzzy-search contracts by title.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contract',
      description: 'Update a contract. Only include fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          contract_type: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          renewal_date: { type: 'string' },
          status: {
            type: 'string',
            enum: ['unsigned', 'active', 'expired', 'ending_soon', 'renewed'],
          },
          value: { type: 'number' },
          notes: { type: 'string' },
          scope: { type: 'string', description: 'Long-form description of what the contract covers.' },
          file_url: { type: 'string', description: 'Public URL to the signed contract PDF.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_contract',
      description: 'Delete a contract. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// SOCIAL ACCOUNTS (per-client)
// =============================================================================

const socialAccountsTools = [
  {
    type: 'function',
    function: {
      name: 'add_social_account',
      description:
        'Attach a social/ads account (Instagram, TikTok, Snapchat, Google Ads, etc.) to a client. Use find_client first to get the client_id. Pass is_default=true to mark this as the primary account for that platform — any existing default for the same client+platform is auto-cleared.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          platform: {
            type: 'string',
            description: 'instagram | tiktok | snapchat | google_ads | facebook | x | linkedin | other.',
          },
          account_name: {
            type: 'string',
            description: 'Display label, e.g. "TechNova Insta" or "TechNova Ad Manager".',
          },
          username: { type: 'string', description: 'Handle, e.g. "technova_sa".' },
          email: { type: 'string', description: 'Email tied to this account.' },
          external_id: {
            type: 'string',
            description: 'Platform-specific id, e.g. Google Ads MCC ID, Snapchat UUID.',
          },
          password: {
            type: 'string',
            description: 'Stored encrypted. Only pass when the user is intentionally sharing it.',
          },
          url: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'needs_attention'] },
          is_default: {
            type: 'boolean',
            description: 'Mark as the primary account for this platform.',
          },
        },
        required: ['client_id', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_social_account',
      description:
        'Find a client\'s social accounts. Pass client_id to list all accounts for that client. Returns account_name, username, email, is_default, etc.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          platform: { type: 'string', description: 'Optional filter.' },
        },
        required: ['client_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_social_account',
      description:
        'Update a social account. To rotate the password, pass the new value in `password` — it will be encrypted server-side. Setting is_default=true auto-clears default on the other accounts of the same client+platform.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          account_name: { type: 'string' },
          username: { type: 'string' },
          email: { type: 'string' },
          external_id: { type: 'string' },
          password: { type: 'string', description: 'New password to rotate to. Stored encrypted.' },
          url: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'needs_attention'] },
          is_default: { type: 'boolean' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_default_social_account',
      description:
        'Mark one social account as the default for its client+platform. Auto-clears default on any other account in the same group.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_social_account',
      description: 'Delete a social account. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// AD CAMPAIGNS
// =============================================================================

const campaignsTools = [
  {
    type: 'function',
    function: {
      name: 'add_campaign',
      description: 'Create an ad campaign for a client. Use find_client first.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          name: { type: 'string' },
          budget: { type: 'number' },
          objective: { type: 'string', description: 'e.g. "leads", "reach", "conversions".' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          status: {
            type: 'string',
            enum: ['planned', 'active', 'paused', 'completed'],
          },
          account_link: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['client_id', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_campaign',
      description: 'Fuzzy-search campaigns by name.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_campaign',
      description: 'Update a campaign.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          budget: { type: 'number' },
          objective: { type: 'string' },
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          status: { type: 'string', enum: ['planned', 'active', 'paused', 'completed'] },
          account_link: { type: 'string' },
          notes: { type: 'string' },
          performance_summary: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_campaign',
      description: 'Delete a campaign. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// CONTRACT PAYMENTS + TASK-CONTRACT LINK
// =============================================================================

const contractPaymentTools = [
  {
    type: 'function',
    function: {
      name: 'add_contract_payment',
      description: 'Add one row to a contract\'s payment schedule. Use when the user says "schedule a payment of X SAR for contract Y due Z" or "log a 5000 SAR payment for the Acme retainer". Use find_contract first to get contract_id.',
      parameters: {
        type: 'object',
        properties: {
          contract_id: { type: 'string' },
          amount: { type: 'number', description: 'In SAR.' },
          due_date: { type: 'string', description: 'ISO YYYY-MM-DD.' },
          paid_date: { type: 'string', description: 'Optional. Set if the payment was already made.' },
          status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'] },
          method: { type: 'string', description: 'e.g. "bank transfer", "cash", "STC Pay".' },
          notes: { type: 'string' },
        },
        required: ['contract_id', 'amount', 'due_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_payment_paid',
      description: 'Flip a contract payment\'s status to "paid" and set its paid_date. Defaults paid_date to today if not given.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Payment row id.' },
          paid_date: { type: 'string', description: 'Optional ISO date — defaults to today.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contract_payment',
      description: 'Update any field on a contract payment row.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          amount: { type: 'number' },
          due_date: { type: 'string' },
          paid_date: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'] },
          method: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_contract_payments',
      description: 'List the payment schedule for a contract.',
      parameters: {
        type: 'object',
        properties: { contract_id: { type: 'string' } },
        required: ['contract_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_contract_payment',
      description: 'Delete a contract payment row. DESTRUCTIVE — confirm with user first.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'link_task_to_contract',
      description: 'Attach an existing task to a contract so it shows up under that contract\'s delivery schedule. Pass contract_id=null to unlink.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          contract_id: { type: 'string', description: 'Contract id, or null/empty to unlink.' },
        },
        required: ['task_id'],
      },
    },
  },
]

// =============================================================================
// TEAM MEMBERS
// =============================================================================

const teamTools = [
  {
    type: 'function',
    function: {
      name: 'add_team_member',
      description: 'Add a staff member to the team. Salary is monthly.',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'manager', 'staff'] },
          job_title: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive'] },
          notes: { type: 'string' },
          salary: { type: 'number', description: 'Monthly salary in salary_currency.' },
          salary_currency: { type: 'string', description: 'Defaults to SAR.' },
        },
        required: ['full_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_team_member',
      description: 'Fuzzy-search team members by name or email.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_team_member',
      description: 'Update a team member. salary is monthly.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          full_name: { type: 'string' },
          role: { type: 'string', enum: ['admin', 'manager', 'staff'] },
          job_title: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive'] },
          notes: { type: 'string' },
          salary: { type: 'number' },
          salary_currency: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_team_member',
      description: 'Delete a team member. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// COMMUNICATION LOGS (append-only)
// =============================================================================

const commLogTools = [
  {
    type: 'function',
    function: {
      name: 'log_communication',
      description:
        'Record a communication event (call, meeting, email, WhatsApp chat) with a client. Use find_client first to get the client_id.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          type: {
            type: 'string',
            description: 'e.g. "call", "meeting", "email", "whatsapp", "site_visit".',
          },
          summary: { type: 'string' },
          notes: { type: 'string' },
          date: {
            type: 'string',
            description: 'Optional ISO timestamp. Defaults to now.',
          },
        },
        required: ['client_id', 'type', 'summary'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_communication_logs',
      description:
        "List communication logs (calls, meetings, emails, etc) on a client's record. Use to answer 'show me Acme's recent calls', 'what did we last email Hisham', 'pull the communication history for X'.",
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Optional. Filters to one client. Omit to search globally.' },
          client_company_name: { type: 'string', description: "Optional. Resolved to client_id via find_client." },
          type: { type: 'string', description: 'Optional type filter: call / meeting / email / whatsapp / note / site_visit.' },
          since_iso: { type: 'string', description: 'Optional. Only return logs after this ISO date/time.' },
          limit: { type: 'integer', description: 'Default 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_communication_log',
      description:
        'Edit an existing communication log entry — fix a typo, append context, recategorize the type, change the date. Need the id (from find_communication_logs).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string' },
          summary: { type: 'string' },
          notes: { type: 'string' },
          date: { type: 'string', description: 'ISO timestamp.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_communication_log',
      description:
        'Remove a communication log entry. DESTRUCTIVE — confirm with the user before calling.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// OUTBOUND WHATSAPP / EMAIL — reach out to someone right now
// =============================================================================

const outboundWhatsappTools = [
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_message',
      description:
        'Send a WhatsApp text to an arbitrary phone RIGHT NOW. Use when the user asks to message/tell/notify someone ("tell +966555... the meeting moved to 4pm", "WhatsApp this person from the business card"). If you are reaching out to a CRM client (e.g. just added them via add_client), pass client_id so the dashboard stamps last_contacted_at and bumps to_contact → lead. For FUTURE deliveries use add_reminder with notify_phone instead. ONE call per message.',
      parameters: {
        type: 'object',
        properties: {
          to_phone: {
            type: 'string',
            description:
              'Destination phone. Accepts +966… international, 9665… digits-only, or 05… local Saudi format. Leading 0 auto-prepends country code 966.',
          },
          text: {
            type: 'string',
            description: 'Message body. Keep it concise; WhatsApp is not email.',
          },
          client_id: {
            type: 'string',
            description:
              'Optional. If this message is the first outreach to a CRM client (you just added them, or the user named one), pass the client id here — the tool stamps last_contacted_at and flips to_contact → lead automatically.',
          },
        },
        required: ['to_phone', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_file',
      description:
        'Send a file from the dashboard /files page (table client_files) to a phone number as a WhatsApp document. Use when the user says things like "send the Emergize profile to +966555..." or "ship the brand guidelines PDF to 0541388964". Pass `query` to fuzzy-match the file name across ALL clients (use this for agency-wide assets like the company profile that aren\'t tied to a specific client). Pass `client_company_name` to scope the search. If multiple files match, the tool returns an error listing them with their ids — call again with file_id to disambiguate. Also marks the client contacted when client_id is passed.',
      parameters: {
        type: 'object',
        properties: {
          to_phone: {
            type: 'string',
            description: 'Destination phone. Accepts +966… international, 9665… digits-only, or 05… local Saudi format.',
          },
          query: {
            type: 'string',
            description: 'Fuzzy-match against client_files.name. Examples: "emergize profile", "brand guidelines", "Q-2026-005". Skip when you already have file_id.',
          },
          file_id: {
            type: 'string',
            description: 'Exact file id (from list_client_files / find_client / earlier ambiguous-match error). Skip when using query.',
          },
          client_company_name: {
            type: 'string',
            description: 'Optional. Limits the file search to one client. Omit for agency-wide assets like the company profile.',
          },
          caption: {
            type: 'string',
            description: 'Optional short text to attach to the document (1-2 sentences).',
          },
          client_id: {
            type: 'string',
            description: 'Optional. If you\'re sending the file as an outreach to a CRM client, pass their id so the dashboard stamps last_contacted_at + bumps to_contact → lead.',
          },
        },
        required: ['to_phone'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_email',
      description:
        'Send an email RIGHT NOW via Resend, optionally with attachments (PDFs, images, any file). Use when the user asks to email someone — typically the email pulled off a business card, a CRM client whose address you already know, or to forward a PDF the user just sent. Pass client_id to mark the client as contacted. ONE call per email; do NOT loop. For SCHEDULED follow-ups, use add_reminder.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address.' },
          subject: { type: 'string', description: 'Email subject line.' },
          text: { type: 'string', description: 'Plain-text email body.' },
          client_id: {
            type: 'string',
            description:
              'Optional. CRM client id — the tool stamps last_contacted_at and flips to_contact → lead automatically.',
          },
          attachments: {
            type: 'array',
            description:
              "Optional file attachments. Each entry is either { url, filename } for a public URL (e.g. the [uploaded_document: …] URL from an inbound WhatsApp PDF, or any client_files.file_path) OR { file_id, filename } pointing at a row in client_files. The tool fetches the bytes server-side and attaches them. Max 5 attachments per email, 20MB total.",
            items: {
              type: 'object',
              properties: {
                url: { type: 'string', description: 'Public URL to fetch.' },
                file_id: { type: 'string', description: 'Alternatively, a client_files.id to look up.' },
                filename: { type: 'string', description: 'Display name shown to the recipient. If omitted, derived from URL/file row.' },
              },
            },
          },
        },
        required: ['to', 'subject', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp_file_url',
      description:
        "Send any PUBLIC FILE URL as a WhatsApp document attachment to a phone number — works for files that aren't in client_files (e.g. a PDF the user just sent and asked you to forward, an external link, a generated report URL). Pass `url` + `to_phone`. The tool fetches the bytes and ships them. For files that ARE in client_files (company profile, brand guidelines), use send_whatsapp_file instead — same effect but it logs the send to communication_logs and bumps last_contacted_at when client_id is passed.",
      parameters: {
        type: 'object',
        properties: {
          to_phone: { type: 'string', description: 'Destination phone. Accepts +966… international, 9665… digits-only, or 05… local Saudi format.' },
          url: { type: 'string', description: 'Public URL of the file to send.' },
          filename: { type: 'string', description: 'Optional display name. Derived from URL if omitted.' },
          mime: { type: 'string', description: 'Optional MIME type. Sniffed from URL if omitted.' },
          caption: { type: 'string', description: 'Optional short text to attach.' },
          client_id: { type: 'string', description: 'Optional. If forwarding to a CRM client, pass their id to stamp last_contacted_at.' },
        },
        required: ['to_phone', 'url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_pdf',
      description:
        "Fetch a PDF from a public URL and return the extracted text. Use when (a) the inbound message's [uploaded_document: …] extracted-text block was truncated and you need more of the file, (b) you need to re-read a PDF later in a follow-up turn, or (c) the user pastes a PDF link they want you to summarize / extract from. Returns { text, pages, truncated }. Max 32MB. NEVER call this on a fresh inbound PDF — the inbound handler already extracted up to 8000 chars and embedded them inline.",
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Public PDF URL.' },
          max_chars: { type: 'integer', description: 'Optional cap on returned text. Default 24000.' },
        },
        required: ['url'],
      },
    },
  },
]

// =============================================================================
// NOTIFICATIONS
// =============================================================================

const notificationTools = [
  {
    type: 'function',
    function: {
      name: 'find_notifications',
      description: 'List recent notifications. Pass only_unread=true to filter to unread.',
      parameters: {
        type: 'object',
        properties: {
          only_unread: { type: 'boolean' },
          limit: { type: 'number', description: 'Defaults to 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_notification_read',
      description: 'Flip is_read=true on one notification.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_all_notifications_read',
      description: 'Mark every unread notification as read in one call.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_notification',
      description: 'Delete a notification row. Mostly safe — notifications are derived data.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_notification',
      description:
        "Push a custom notification into the dashboard bell (and, via the existing scheduler, onto the recipient's WhatsApp). Use for one-off heads-up messages that aren't already covered by the automatic notification paths — e.g. 'ping Hisham that the client is calling at 4pm', 'tell the team Acme's invoice is overdue', 'remind Sara about the offsite tomorrow'. For TIMED reminders use add_reminder instead — that has its own scheduler. Pass user_id (an auth user id) to target a specific person, or omit/null for an admin-broadcast.",
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'One-line headline shown in the bell.' },
          message: { type: 'string', description: 'Body text. Keep tight.' },
          user_id: {
            type: 'string',
            description:
              'Optional. Auth user id (NOT team_member.id) to target. Resolve via team_members.user_id if you only know the person by name. Omit for an admin-broadcast (notifies every admin).',
          },
          team_member_id: {
            type: 'string',
            description:
              'Optional convenience: pass team_members.id and the tool will look up the matching auth user_id automatically. Use this when you only know the team member, not their auth user.',
          },
          related_id: { type: 'string', description: 'Optional UUID — id of the underlying entity (task, contract, client...) the notification is about. The dashboard uses this to deep-link.' },
          type: {
            type: 'string',
            description:
              "Notification type. Common values: 'task_assigned', 'task_completed', 'contract_alert', 'content_pending_review', 'content_approved', 'content_rejected', 'report_assigned', 'system'. Defaults to 'system'.",
          },
        },
        required: ['title', 'message'],
      },
    },
  },
]

// =============================================================================
// CONTENT ITEMS (social media posts / drafts)
// =============================================================================

const contentItemTools = [
  {
    type: 'function',
    function: {
      name: 'add_content_item',
      description: 'Schedule or draft a social-media content item for a client. Use schedule_status to track lifecycle.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          client_company_name: { type: 'string', description: 'Optional alternative to client_id — agent resolves.' },
          platform: { type: 'string', description: 'instagram | tiktok | snapchat | google_ads | other.' },
          content_type: { type: 'string', description: 'reel | post | story | ad' },
          title: { type: 'string' },
          caption: { type: 'string' },
          media_url: { type: 'string' },
          publish_date: { type: 'string', description: 'ISO YYYY-MM-DD.' },
          publish_time: { type: 'string', description: 'HH:MM (24h, local).' },
          schedule_status: { type: 'string', enum: ['idea', 'pending', 'approved', 'scheduled', 'published'] },
          campaign_name: { type: 'string' },
          assignee_name: { type: 'string', description: 'Resolved to assignee_id.' },
          notes: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_content_item',
      description: 'Fuzzy-search content items by title.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          schedule_status: { type: 'string' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_content_item',
      description: 'Edit a content item — change schedule, status, caption, reassign owner, etc.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          caption: { type: 'string' },
          media_url: { type: 'string' },
          publish_date: { type: 'string' },
          publish_time: { type: 'string' },
          schedule_status: { type: 'string', enum: ['idea', 'pending', 'approved', 'scheduled', 'published'] },
          task_status: { type: 'string', enum: ['not_started', 'in_progress', 'completed'] },
          campaign_name: { type: 'string' },
          assignee_name: {
            type: 'string',
            description: 'Reassign to this team member (resolved by name). Pass an empty string to unassign.',
          },
          notes: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_content_item',
      description: 'Delete a content item. DESTRUCTIVE — confirm with user.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// CLIENT FILES (file metadata only — uploads happen via the dashboard UI)
// =============================================================================

const clientFileTools = [
  {
    type: 'function',
    function: {
      name: 'list_client_files',
      description: 'List the files attached to a client.',
      parameters: {
        type: 'object',
        properties: { client_id: { type: 'string' } },
        required: ['client_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_client_file_link',
      description: 'Attach a file by URL to a client (e.g. a Google Drive / Dropbox link). Skips actually storing bytes — just records the metadata so it appears in the Files tab.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          name: { type: 'string', description: 'Display name, e.g. "Signed contract — TSSC.pdf".' },
          file_path: { type: 'string', description: 'Public/shareable URL.' },
          category: { type: 'string', description: 'e.g. "contract", "invoice", "design", "report".' },
          file_type: { type: 'string', description: 'MIME or short label, e.g. "application/pdf" or "pdf".' },
        },
        required: ['client_id', 'name', 'file_path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_client_file',
      description:
        'Rename a file, change its category, reassign to a different client, or fix the URL/MIME. Used for "rename the brand-guidelines.pdf to brand-2026.pdf", "move that contract from Acme to TSSC", "recategorize this as invoice not design".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string' },
          client_id: { type: 'string', description: 'Reassign to a different client.' },
          file_type: { type: 'string' },
          file_path: { type: 'string', description: 'New URL.' },
          file_size: { type: 'number', description: 'Bytes.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_client_file',
      description: 'Remove a file row. Only deletes the metadata — uploaded blobs in storage stay until cleaned manually.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// CLIENT SERVICES (simple tags)
// =============================================================================

const clientServicesTools = [
  {
    type: 'function',
    function: {
      name: 'add_client_service',
      description: 'Add a service (e.g. "SEO", "social media management") to a client.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          service_name: { type: 'string' },
        },
        required: ['client_id', 'service_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_client_service',
      description: 'Remove a service from a client. Requires the service row id.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_client_services',
      description: 'List all services attached to a client.',
      parameters: {
        type: 'object',
        properties: { client_id: { type: 'string' } },
        required: ['client_id'],
      },
    },
  },
]

// =============================================================================
// QUOTATIONS
// =============================================================================

const quotationTools = [
  {
    type: 'function',
    function: {
      name: 'create_quotation',
      description:
        'Create a new quotation (price estimate document). Auto-generates the quote number (Q-YYYY-NNN). Only client-facing fields are required — company info (Emergize VAT/CR/address/phone/email) and payment terms default to Emergize\'s standard values. After creating, you MUST call add_quotation_item for each line item the user mentioned.',
      parameters: {
        type: 'object',
        properties: {
          client_name_en: { type: 'string', description: 'Client name in English (e.g. "MR / Amr").' },
          client_name_ar: { type: 'string', description: 'Client name in Arabic if user gave one.' },
          client_company: { type: 'string' },
          client_vat: { type: 'string' },
          client_cr: { type: 'string' },
          client_company_name: {
            type: 'string',
            description:
              'Optional. If the client is already in the CRM, pass their company_name here and the agent will look up and link the client_id.',
          },
          issue_date: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to today.' },
          valid_until: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to today+30.' },
          vat_rate: { type: 'number', description: 'Defaults to 15.' },
          term1_pct: { type: 'string', description: 'First-payment percentage label, e.g. "50%".' },
          term1_desc: { type: 'string' },
          term2_pct: { type: 'string' },
          term2_desc: { type: 'string' },
          notes: { type: 'string' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_quotation_item',
      description:
        'Append one line item to an existing quotation. Use pricing_mode="fixed" with qty + unit_price for normal items, or pricing_mode="percentage" with percentage for "% of profit"-style pricing. Call once per line item.',
      parameters: {
        type: 'object',
        properties: {
          quotation_id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          pricing_mode: { type: 'string', enum: ['fixed', 'percentage'] },
          qty: { type: 'number' },
          unit_price: { type: 'number', description: 'In SAR.' },
          percentage: { type: 'number', description: 'Only if pricing_mode="percentage".' },
        },
        required: ['quotation_id', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_quotation',
      description:
        'Search quotations by quote_number substring OR by client name. Returns up to 5 matches with id, quote_number, client_name_en, status.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_quotation',
      description: 'Update any editable header field on a quotation. Only include fields you want to change.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          client_name_en: { type: 'string' },
          client_name_ar: { type: 'string' },
          client_company: { type: 'string' },
          client_vat: { type: 'string' },
          client_cr: { type: 'string' },
          issue_date: { type: 'string' },
          valid_until: { type: 'string' },
          vat_rate: { type: 'number' },
          term1_pct: { type: 'string' },
          term1_desc: { type: 'string' },
          term2_pct: { type: 'string' },
          term2_desc: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_quotation_status',
      description: 'Change a quotation\'s status. Use when user says "mark Q-2026-001 as sent/accepted/paid/rejected".',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'sent', 'accepted', 'rejected', 'paid'] },
        },
        required: ['id', 'status'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_quotation_item',
      description: 'Delete a single line item from a quotation.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Line item id (not quotation id).' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_quotation',
      description:
        'Delete a quotation and cascade-delete its line items. DESTRUCTIVE — only call after the user confirms.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_quotation_pdf',
      description:
        'Render the quotation to an A4 PDF and send it to the user as a WhatsApp document attachment. Call this AFTER create_quotation + all add_quotation_item calls are done for a new quote, OR when the user asks for the PDF of an existing quote ("send me Q-2026-001 as PDF"). Don\'t call mid-edit.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Quotation id.' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// LONG-TERM MEMORY
// =============================================================================

const memoryTools = [
  {
    type: 'function',
    function: {
      name: 'remember_fact',
      description:
        'Save a durable fact or preference to the agent\'s long-term memory. Saved facts become part of the system prompt in every future conversation. ONLY use when: (a) the user explicitly tells you to remember/memorize/save something, OR (b) you learn a clearly persistent preference (timezone, city, default currency, name of primary contact at a company). NEVER save ephemeral state (current task, today\'s meeting, in-progress request).',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The fact, in one concise sentence.' },
        },
        required: ['text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'forget_fact',
      description:
        'Remove a saved memory. The id must match one of the [mem_xxxxx] ids in the "Saved memories" system prompt section.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Memory id, e.g. "mem_a1b2c3".' },
        },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// WEEKLY REPORTS (client-facing performance + delivery recap)
// =============================================================================

const weeklyReportTools = [
  {
    type: 'function',
    function: {
      name: 'create_weekly_report',
      description:
        'Start a new weekly client report. Auto-generates report_number (WR-YYYY-Wnn). After creating, use add_report_service to append one block per service the user wants to report on (SEO, cold mailing, social, paid promotions, etc).',
      parameters: {
        type: 'object',
        properties: {
          customer_name: {
            type: 'string',
            description: 'Customer / contact person the report is addressed to.',
          },
          customer_company: { type: 'string', description: 'Customer\'s company.' },
          client_company_name: {
            type: 'string',
            description: 'Optional. If they exist in the CRM, pass their company_name to link client_id.',
          },
          period_start: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to last Monday.' },
          period_end: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to today.' },
          summary: { type: 'string', description: 'Executive summary paragraph.' },
          notes: { type: 'string', description: 'Notes & recommendations.' },
          cover_image_url: { type: 'string', description: 'Optional hero image shown next to the customer name.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_weekly_report',
      description: 'Search reports by report_number substring or customer name.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_weekly_report',
      description: 'Edit cover info / summary / notes / status of a report. For service blocks, use add_report_service / update_report_service / remove_report_service.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          customer_name: { type: 'string' },
          customer_company: { type: 'string' },
          period_start: { type: 'string' },
          period_end: { type: 'string' },
          summary: { type: 'string' },
          notes: { type: 'string' },
          cover_image_url: { type: 'string' },
          status: { type: 'string', enum: ['draft', 'sent', 'archived'] },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'delete_weekly_report',
      description: 'Delete a report. DESTRUCTIVE — confirm with user.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'schedule_weekly_reports',
      description:
        "Pre-create N consecutive weekly report drafts for a client and assign them to a team member, the same way the new-client wizard does. Use for 'schedule 12 weeks of reports for Acme to Hisham', 'set up the reporting cadence for X', 'add a year of weekly reports for the new client and put Sara in charge'. Each report's period_end becomes a calendar event automatically, and the assignee gets a notification (which the agent forwards to their WhatsApp). Each report row defaults to status='draft', empty services [], period_start at the chosen Monday, period_end +6 days, issue_date +7 days.",
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Resolve via find_client if needed.' },
          client_company_name: { type: 'string', description: "Alternative to client_id — the tool resolves." },
          assignee_team_member_id: { type: 'string', description: 'team_members.id of the responsible person. Resolve via find_team_member.' },
          assignee_name: { type: 'string', description: "Alternative — full name of the team member. The tool looks up the id." },
          weeks: { type: 'integer', description: 'How many weekly reports to create. 1-52. Defaults to 12.' },
          start_date_iso: { type: 'string', description: "ISO date for period_start of the FIRST report. Defaults to next Monday." },
        },
        required: [],
      },
    },
  },
  // ---------- Service blocks (the new model) ----------
  {
    type: 'function',
    function: {
      name: 'add_report_service',
      description:
        'Append a service block (SEO, Cold Mailing, Social Media, Paid Promotions, Content, Branding, Web, or Custom) to the report. Pass `body` for the narrative paragraph; `metrics` for KPI cards; `items` for a bulleted list; `images` for thumbnails. Returns the new block id.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          kind: {
            type: 'string',
            enum: ['seo', 'cold_mail', 'social', 'paid_promo', 'content', 'branding', 'web', 'custom'],
            description: 'Picks default title + icon. Use "custom" for anything else.',
          },
          title: { type: 'string', description: 'Override the default title (e.g. "Cold Mailing — Q2 push").' },
          icon: { type: 'string', description: 'Override the default emoji icon.' },
          body: { type: 'string', description: 'Narrative paragraph describing what was done.' },
          metrics: {
            type: 'array',
            description: 'KPI cards. Each item: { label, value }.',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['label', 'value'],
            },
          },
          items: {
            type: 'array',
            description: 'Bulleted list rows. Each item: { title, detail? }.',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                detail: { type: 'string' },
              },
              required: ['title'],
            },
          },
          images: {
            type: 'array',
            description: 'Thumbnails. Each item: { url, caption? }. Use upload_image to get URLs.',
            items: {
              type: 'object',
              properties: {
                url: { type: 'string' },
                caption: { type: 'string' },
              },
              required: ['url'],
            },
          },
        },
        required: ['report_id', 'kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_report_service',
      description:
        'Replace the contents of a service block. Pass the fields you want to change; omitted fields keep their current values.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          service_id: { type: 'string', description: 'The block id from add_report_service / find_weekly_report.' },
          title: { type: 'string' },
          icon: { type: 'string' },
          body: { type: 'string' },
          metrics: {
            type: 'array',
            items: {
              type: 'object',
              properties: { label: { type: 'string' }, value: { type: 'string' } },
              required: ['label', 'value'],
            },
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: { title: { type: 'string' }, detail: { type: 'string' } },
              required: ['title'],
            },
          },
          images: {
            type: 'array',
            items: {
              type: 'object',
              properties: { url: { type: 'string' }, caption: { type: 'string' } },
              required: ['url'],
            },
          },
        },
        required: ['report_id', 'service_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_service',
      description: 'Remove a service block from the report.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          service_id: { type: 'string' },
        },
        required: ['report_id', 'service_id'],
      },
    },
  },
  // ---------- Image upload ----------
  {
    type: 'function',
    function: {
      name: 'upload_image',
      description:
        'Upload an image to the report-images bucket and return its public URL. Pass either a remote image_url (agent fetches and re-hosts) OR base64 image_data with mime (raw bytes from a WhatsApp/chat attachment). Returns { public_url } you can drop into add_report_service.images[].url or update_weekly_report.cover_image_url.',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string' },
          image_data: { type: 'string' },
          mime: { type: 'string' },
          filename_hint: { type: 'string' },
        },
      },
    },
  },
  // ---------- Render PDF ----------
  {
    type: 'function',
    function: {
      name: 'send_weekly_report_pdf',
      description:
        'Render the weekly report to an A4 PDF and send it to the user as a WhatsApp document. Call after the report is fully populated.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Report id.' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// ACCOUNTING / VAT INVOICES — receipt PDF → extracted draft → admin approve →
// push to Qoyod
// =============================================================================

const accountingTools = [
  {
    type: 'function',
    function: {
      name: 'create_draft_invoice',
      description:
        "Create a DRAFT VAT invoice in the dashboard's accounting section. Use when the admin forwards a payment receipt PDF and asks you to invoice the client. Workflow: (1) read the receipt's [uploaded_document: …] extracted text to pull vendor name, amount, payment date, reference; (2) optionally find_quotation to grab the original line items; (3) call this tool with the receipt url + extracted fields. Returns the new invoice id + invoice_number. The admin then reviews/edits in the dashboard at /accounting/<id> and clicks Approve, then Push to send it to Qoyod. ONE call per receipt.",
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string', description: 'Optional. The CRM client this invoice is for. Find via find_client first if the admin named a client.' },
          quotation_id: { type: 'string', description: 'Optional. The original quotation. If you pass this and omit line_items, the tool copies the quote\'s items.' },
          contract_id: { type: 'string', description: 'Optional. The signed contract.' },
          receipt_url: { type: 'string', description: 'Public URL of the receipt PDF (from the [uploaded_document: …] tag on the user message).' },
          customer_name: { type: 'string', description: 'Customer / counterparty name as it should appear on the VAT invoice.' },
          customer_vat: { type: 'string', description: 'Customer\'s VAT number if visible on the receipt or known from the client record.' },
          customer_cr: { type: 'string', description: 'Customer\'s Commercial Registration number if known.' },
          customer_address: { type: 'string', description: 'Customer address (optional but recommended).' },
          payment_date: { type: 'string', description: 'ISO date the bank cleared the transfer.' },
          payment_method: { type: 'string', description: "e.g. 'bank_transfer', 'cash', 'cheque', 'card'." },
          payment_reference: { type: 'string', description: 'Transaction ID / reference from the bank receipt.' },
          currency: { type: 'string', description: "ISO code. Default 'SAR'." },
          vat_rate: { type: 'number', description: 'VAT rate as a percentage. KSA standard is 15.' },
          line_items: {
            type: 'array',
            description: 'Invoice line items. If omitted and quotation_id is set, the tool reuses the quote\'s items. If both are omitted but a total is given, a single placeholder line is generated for the admin to edit.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                qty: { type: 'number' },
                unit_price: { type: 'number' },
                vat_rate: { type: 'number' },
              },
              required: ['description'],
            },
          },
          subtotal: { type: 'number', description: 'Sum of line totals before VAT. Computed automatically if line_items are passed; supply when only a flat total is known.' },
          total: { type: 'number', description: 'Grand total (subtotal + VAT). Useful when the receipt shows only a final figure.' },
          notes: { type: 'string', description: 'Free-form notes that will appear on the invoice.' },
        },
        required: ['customer_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_invoices',
      description:
        'List or search accounting invoices. Use to answer "show me the latest invoice", "any drafts pending?", "did we invoice Acme for the May payment?".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: "Filter by status: 'draft' / 'approved' / 'pushed' / 'failed' / 'void'." },
          client_id: { type: 'string' },
          q: { type: 'string', description: 'Fuzzy match against customer_name / invoice_number.' },
          limit: { type: 'integer', description: 'Default 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_invoice',
      description:
        'Approve a draft invoice (flips status draft → approved). Admin-only. Does NOT push to Qoyod yet — that\'s a separate step. Use when admin says "approve INV-2026-001" or "yes, looks good — approve it".',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Invoice id (UUID) or invoice_number (e.g. INV-2026-001).' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_invoice',
      description:
        'Push an APPROVED invoice to the configured accounting system (Qoyod). Will fail with a clear error if no API token is set yet — surface that error to the user verbatim. Admin-only.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Invoice id or invoice_number.' } },
        required: ['id'],
      },
    },
  },
]

// =============================================================================
// OVERDUE NAGS — scheduler creates drafts; admin replies "send"/"skip" on
// WhatsApp to act. These tools let the LLM look up the pending drafts and
// fire / skip / reject them.
// =============================================================================

const nagsTools = [
  {
    type: 'function',
    function: {
      name: 'find_pending_nags',
      description:
        'List pending overdue-invoice nag drafts the scheduler created but admin hasn\'t acted on yet. Use when admin replies "send" or "skip" without specifying which invoice — show them the list so they can disambiguate, or auto-pick the most recent if only one is pending.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Default 5.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'send_nag',
      description:
        'Actually send the nag draft to the client. The "channel" arg picks how: whatsapp routes via the agent\'s sock (uses the client\'s whatsapp/phone field), email uses Resend. Flips invoice_nag_log status to "sent" and stamps sent_at. Pass nag_id (UUID) if known, otherwise invoice_number + stage so the tool can look it up.',
      parameters: {
        type: 'object',
        properties: {
          nag_id: { type: 'string', description: 'UUID of the invoice_nag_log row.' },
          invoice_number: { type: 'string', description: 'Alternative: invoice number (e.g. INV-2026-001) — combined with stage to look up.' },
          stage: { type: 'string', enum: ['gentle_7d', 'firm_14d', 'escalation_30d'] },
          channel: { type: 'string', enum: ['whatsapp', 'email'] },
          edited_body: { type: 'string', description: 'Optional. If admin asked to tweak the wording before sending, pass the new body here. Otherwise the stored draft is used.' },
        },
        required: ['channel'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'skip_nag',
      description:
        'Mark a nag draft as skipped (admin doesn\'t want to send it). Same identification rules as send_nag — nag_id OR invoice_number+stage.',
      parameters: {
        type: 'object',
        properties: {
          nag_id: { type: 'string' },
          invoice_number: { type: 'string' },
          stage: { type: 'string', enum: ['gentle_7d', 'firm_14d', 'escalation_30d'] },
        },
      },
    },
  },
]

// =============================================================================
// BILLS / EXPENSES — vendor receipt PDF or expense photo → AI extracts →
// draft bill → admin approves → push to Qoyod. The accounts-payable
// mirror of accountingTools. Same admin/draft/approve/push lifecycle.
// =============================================================================

const billsTools = [
  {
    type: 'function',
    function: {
      name: 'create_draft_bill',
      description:
        "Create a DRAFT expense bill in the dashboard's accounting section. Use when the admin forwards a vendor receipt (restaurant, fuel station, software subscription, parking, etc.) OR a vendor invoice PDF and asks you to record it. Workflow: (1) read the [uploaded_document: …] extracted text or [uploaded_image: …] OCR to pull vendor_name, total, vat, date; (2) decide is_simple — a one-line restaurant receipt = true, an itemized vendor invoice with multiple SKUs = false; (3) call this tool. Returns the new bill id + bill_reference (BILL-YYYY-NNN). Admin reviews/edits at /accounting/bills/<id> and clicks Approve, then Push to send it to Qoyod as a /bill (itemized) or /simple_bill (single-line). ONE call per receipt.",
      parameters: {
        type: 'object',
        properties: {
          vendor_name: { type: 'string', description: 'Vendor / supplier / merchant name exactly as it should appear on the bill. Required.' },
          vendor_vat: { type: 'string', description: "Vendor's VAT number if visible on the receipt." },
          vendor_cr: { type: 'string', description: "Vendor's Commercial Registration number if visible." },
          vendor_address: { type: 'string', description: 'Vendor address if visible.' },
          receipt_url: { type: 'string', description: 'Public URL of the receipt PDF or photo (from the [uploaded_document: …] / [uploaded_image: …] tag).' },
          bill_number: { type: 'string', description: "Vendor's own invoice/receipt number printed on the document." },
          issue_date: { type: 'string', description: 'ISO date the receipt was issued. Defaults to today.' },
          due_date: { type: 'string', description: 'ISO date payment is due, when stated on a vendor invoice.' },
          payment_date: { type: 'string', description: 'ISO date payment cleared, if already paid (e.g. card receipt). Setting this triggers a /bill_payments record on push.' },
          payment_method: { type: 'string', description: "e.g. 'bank_transfer', 'cash', 'card', 'mada', 'stc_pay', 'cheque'." },
          payment_reference: { type: 'string', description: 'Transaction id / reference from the receipt.' },
          category: { type: 'string', description: "Expense category — 'meals', 'fuel', 'software', 'subscriptions', 'office_supplies', 'rent', 'utilities', 'marketing', 'professional_fees', 'salaries', 'training', 'travel', 'cloud_hosting', 'misc'. If omitted, the tool checks if this vendor has a learned mapping and uses that." },
          is_simple: { type: 'boolean', description: "Use true for simple single-line cash/card receipts (one-pizza-place / one-petrol-stop). Use false for itemized vendor invoices with multiple SKUs and a VAT breakdown. Default false." },
          currency: { type: 'string', description: "ISO code. Default 'SAR'." },
          vat_rate: { type: 'number', description: 'VAT rate as a percentage. KSA standard is 15.' },
          line_items: {
            type: 'array',
            description: 'Optional. Bill line items. For simple bills leave empty (a single placeholder line is generated). For itemized vendor invoices pass each line.',
            items: {
              type: 'object',
              properties: {
                description: { type: 'string' },
                qty: { type: 'number' },
                unit_price: { type: 'number' },
                vat_rate: { type: 'number' },
              },
              required: ['description'],
            },
          },
          subtotal: { type: 'number', description: 'Pre-VAT total. Computed automatically if line_items are passed; supply when only a final total is on the receipt.' },
          total: { type: 'number', description: 'Grand total (subtotal + VAT). For simple cash receipts this is often the only figure printed.' },
          notes: { type: 'string', description: 'Free-form notes. Useful for capturing what the receipt was for in plain English/Arabic.' },
        },
        required: ['vendor_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_bills',
      description:
        'List or search accounting bills (expenses / vendor invoices). Use to answer "show me the latest expense", "any draft bills pending?", "how much did we spend on software last month?", "did we pay Salla yet?".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: "Filter by status: 'draft' / 'approved' / 'pushed' / 'paid' / 'failed' / 'void'." },
          category: { type: 'string', description: 'Filter by expense category.' },
          vendor: { type: 'string', description: 'Fuzzy match against vendor_name.' },
          q: { type: 'string', description: 'Fuzzy match against vendor_name / bill_reference / bill_number.' },
          from_date: { type: 'string', description: 'Only bills issued on or after this ISO date.' },
          to_date: { type: 'string', description: 'Only bills issued on or before this ISO date.' },
          limit: { type: 'integer', description: 'Default 20.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_bill',
      description:
        'Approve a draft bill (flips status draft → approved) AND records the vendor → category mapping for future auto-suggestion. Admin-only. Does NOT push to Qoyod yet — that\'s a separate step. Use when admin says "approve BILL-2026-007" or "yes, looks good — approve it".',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Bill id (UUID) or bill_reference (e.g. BILL-2026-007).' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'push_bill',
      description:
        'Push an APPROVED bill to Qoyod. Uses /bills (itemized) or /simple_bills depending on is_simple. If payment_date is set, also records a /bill_payments entry and flips status to paid. Will fail with a clear error if Qoyod API key is missing — surface verbatim. Admin-only.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: 'Bill id or bill_reference.' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggest_bill_category',
      description:
        'Look up the previously-learned expense category for a vendor. Use BEFORE create_draft_bill so the category can be pre-filled. Returns { category, hit_count } if known, or null if this vendor is new.',
      parameters: {
        type: 'object',
        properties: { vendor_name: { type: 'string' } },
        required: ['vendor_name'],
      },
    },
  },
]

// =============================================================================
// HR — leave + attendance + payroll + EOSB + onboarding + CV intake + letters
// + documents + expiry watchdog tools (features F1–F13).
// =============================================================================

const hrTools = [
  // ------- Leave (F2 + F3) --------
  {
    type: 'function',
    function: {
      name: 'request_leave_for_self',
      description:
        "Submit a leave request on behalf of the WhatsApp sender. The tool resolves the sender's phone → team_members.whatsapp → employee row, then creates a leave_requests entry as 'pending' and DMs the admin with the draft + a conflict-risk summary (who else is on leave that week, tasks/reports due in the window assigned to this employee). Use when an employee says \"can I take Aug 15-19 off, cousin's wedding\" or similar.",
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'ISO YYYY-MM-DD. Required.' },
          end_date: { type: 'string', description: 'ISO YYYY-MM-DD. Required.' },
          type: {
            type: 'string',
            enum: ['annual','sick','unpaid','personal','maternity','paternity','bereavement','hajj','other'],
            description: "If unclear, infer from context — wedding/holiday → 'annual', funeral → 'bereavement', illness → 'sick', hajj season → 'hajj', etc. Default 'annual'.",
          },
          reason: { type: 'string' },
          override_employee_id: { type: 'string', description: 'Optional. If admin is filing on someone else\'s behalf, pass the target employee\'s UUID instead of resolving from sender.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_leave_requests',
      description: 'List or search leave_requests. Use for "any pending leaves?", "show Ahmad\'s leave history".',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['pending','approved','rejected','cancelled'] },
          employee_id: { type: 'string' },
          employee_name: { type: 'string', description: 'Fuzzy match on team_members.full_name.' },
          from_date: { type: 'string' },
          to_date: { type: 'string' },
          limit: { type: 'integer', description: 'Default 10.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_leave',
      description:
        "Approve a pending leave request. Flips status → 'approved' AND decrements the employee's annual_leave_balance (for type='annual' only). Admin-only.",
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'leave_requests.id (UUID).' },
          decision_note: { type: 'string', description: 'Optional note shown to employee.' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_leave',
      description: 'Reject a pending leave request. Admin-only.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          decision_note: { type: 'string', description: 'Reason — required.' },
        },
        required: ['id', 'decision_note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'check_leave_conflicts',
      description:
        'Standalone conflict checker — useful when admin asks "anyone on leave next week?" without a specific request to evaluate. Returns the same overlap + workload summary the approval card uses.',
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string' },
          end_date: { type: 'string' },
          employee_id: { type: 'string', description: 'Optional. If set, also reports that employee\'s tasks/reports due in the window.' },
        },
        required: ['start_date', 'end_date'],
      },
    },
  },

  // ------- Payroll + EOSB (F4 + F5) --------
  {
    type: 'function',
    function: {
      name: 'generate_payroll',
      description:
        'Build the monthly payroll run for every active employee. For each row computes: base_salary + allowances + bonuses − GOSI (9% if gosi_subject="saudi", 2% if "expat") − prorated unpaid leave days, with a payroll_line_items breakdown. Re-running for the same month overwrites pending rows; paid rows are left alone.',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer', description: '1..12' },
        },
        required: ['year', 'month'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_payroll_paid',
      description: 'Flip a single payroll_records row to status="paid", stamp paid_date + method. Optionally fires the salary slip via send_salary_slip.',
      parameters: {
        type: 'object',
        properties: {
          payroll_id: { type: 'string' },
          paid_date: { type: 'string', description: 'ISO. Defaults to today.' },
          method: { type: 'string', description: "'bank_transfer' / 'cash' / 'cheque'" },
          notes: { type: 'string' },
          send_slip: { type: 'boolean', description: 'If true, also call send_salary_slip after marking paid. Default true.' },
        },
        required: ['payroll_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_payroll',
      description: 'List payroll records for an employee or a month.',
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          year: { type: 'integer' },
          month: { type: 'integer' },
          status: { type: 'string', enum: ['pending', 'paid', 'cancelled'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'compute_eosb',
      description:
        "Compute today's accrued end-of-service balance for an employee following KSA labour-law rules (0.5 month salary per year for the first 5 years, 1 month per year thereafter). Snapshots the result in eosb_snapshots. Use for cash-flow planning or before terminations.",
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          as_of_date: { type: 'string', description: 'ISO. Default today.' },
        },
      },
    },
  },

  // ------- Salary slip (F6) --------
  {
    type: 'function',
    function: {
      name: 'send_salary_slip',
      description:
        'Generate a bilingual Arabic+English salary slip PDF for a paid payroll record and deliver it to the employee via WhatsApp + email. Re-running re-generates and re-sends.',
      parameters: {
        type: 'object',
        properties: {
          payroll_id: { type: 'string' },
          channel: { type: 'string', enum: ['whatsapp', 'email', 'both'], description: "Default 'both'." },
        },
        required: ['payroll_id'],
      },
    },
  },

  // ------- Onboarding (F7) --------
  {
    type: 'function',
    function: {
      name: 'start_onboarding',
      description:
        "Create an onboarding checklist for a freshly-added team_member. Auto-picks template from employment_type + nationality (Saudi vs expat differs on GOSI / iqama steps). Inserts one onboarding_checklist_items row per step. Use right after add_team_member.",
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          template: {
            type: 'string',
            enum: ['saudi_full_time','expat_full_time','part_time','intern','contractor'],
            description: 'Optional override. If omitted, picked from employee fields.',
          },
        },
        required: ['employee_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'mark_onboarding_item_done',
      description: 'Flip a single onboarding item to done.',
      parameters: {
        type: 'object',
        properties: { item_id: { type: 'string' } },
        required: ['item_id'],
      },
    },
  },

  // ------- 1-on-1 performance brief (F8) --------
  {
    type: 'function',
    function: {
      name: 'performance_brief',
      description:
        "Generate a per-employee 1-on-1 brief covering the past N days: tasks closed, clients touched, content posted, weekly reports authored, leave taken, late check-ins. Returns the brief text + sourced metrics for the manager to use in a 1:1 conversation. Default period = 30 days.",
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          days: { type: 'integer', description: 'Lookback window. Default 30.' },
        },
      },
    },
  },

  // ------- Attendance (F9) --------
  {
    type: 'function',
    function: {
      name: 'log_attendance',
      description:
        'Record an employee\'s check-in / check-out / WFH / late status. Use when an employee DMs "in", "out", "WFH", "running 30 min late", "out for lunch", etc. Resolves employee from sender\'s WhatsApp phone unless override_employee_id is given. One attendance_logs row per (employee, date) — subsequent DMs update the row.',
      parameters: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['check_in','check_out','wfh','late','absent'] },
          late_minutes: { type: 'integer', description: 'Required when action=late.' },
          notes: { type: 'string' },
          override_employee_id: { type: 'string' },
          log_date: { type: 'string', description: "ISO. Default today." },
        },
        required: ['action'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'attendance_report',
      description: 'Monthly attendance + lateness report. Returns per-employee totals: days present, WFH, late count, total late minutes, absences. Useful before payroll.',
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
          employee_id: { type: 'string' },
        },
      },
    },
  },

  // ------- CV intake (F10) --------
  {
    type: 'function',
    function: {
      name: 'add_candidate',
      description:
        "Create a candidate record from a CV. Use when admin forwards a candidate's CV PDF (the [uploaded_document: …] block contains the extracted text). Extract: full_name, email/phone/whatsapp, current_title, years_experience, education, skills (array), languages (array), asking_salary if mentioned, nationality if visible.",
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
          email: { type: 'string' },
          phone: { type: 'string' },
          whatsapp: { type: 'string' },
          nationality: { type: 'string' },
          current_city: { type: 'string' },
          current_title: { type: 'string' },
          years_experience: { type: 'number' },
          education: { type: 'string' },
          skills: { type: 'array', items: { type: 'string' } },
          languages: { type: 'array', items: { type: 'string' } },
          asking_salary: { type: 'number' },
          salary_currency: { type: 'string', description: "Default 'SAR'." },
          cv_url: { type: 'string', description: 'URL from uploaded_document tag.' },
          cv_text: { type: 'string', description: 'Extracted PDF text (truncated if very long).' },
          notes: { type: 'string' },
        },
        required: ['full_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_candidates',
      description: 'Search candidates by status, name, or skill keyword.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new','reviewing','interviewing','offered','hired','rejected','archived'] },
          q: { type: 'string', description: 'Match full_name / current_title / cv_text.' },
          skill: { type: 'string' },
          limit: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'promote_candidate_to_employee',
      description:
        "Convert a candidate row into a real team_members row. Copies name/email/phone/whatsapp/nationality. Sets status='active' on team_member, sets candidate.status='hired' + stamps promoted_to_team_member_id. Automatically kicks off start_onboarding.",
      parameters: {
        type: 'object',
        properties: {
          candidate_id: { type: 'string' },
          job_title: { type: 'string' },
          base_salary: { type: 'number' },
          hire_date: { type: 'string', description: 'ISO. Default today.' },
          employment_type: { type: 'string', enum: ['full_time','part_time','contractor','intern'] },
        },
        required: ['candidate_id'],
      },
    },
  },

  // ------- HR letters (F11) --------
  {
    type: 'function',
    function: {
      name: 'draft_hr_letter',
      description:
        "Draft any of 50+ KSA-labour-law-aware HR documents — bilingual Arabic+English body, references KSA Labour Law articles, citation-ready for embassies/banks/government. Saves to hr_letters as 'draft' which the admin reviews + sends from /hr/letters/<id>. Admin-only — for employee-initiated requests use request_hr_letter.",
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          letter_type: {
            type: 'string',
            description: "Pick the template that matches the document needed. Categories: HIRING (job_offer, employment_contract, employment_letter, nda, probation_completion, job_description) | COMPENSATION (salary_certificate, salary_certificate_for_bank, raise_letter, promotion_letter, bonus_letter, compensation_review) | LEAVE (vacation_request_letter, sick_leave_notice, maternity/paternity/hajj/bereavement/unpaid_leave_letter, return_to_work_letter, leave_approval/rejection_letter) | DISCIPLINE (verbal/written/final_warning, suspension_letter, disciplinary_notice, termination) | EXTERNAL (noc, experience_letter, bank_loan_support_letter, visa_support_letter, dependent_visa_support, embassy_letter, property_rental_support, recommendation_letter) | KSA (hrdf_letter, gosi_subscription_letter, saudization_letter, mudawana_amendment) | FINANCIAL (loan_request_letter, salary_advance_letter, salary_advance_repayment_schedule, expense_reimbursement_letter) | LIFECYCLE (resignation_letter, resignation_acceptance, transfer_letter, relocation_letter, final_settlement_letter, exit_clearance_letter, retirement_letter) | custom",
            enum: ['job_offer','employment_contract','employment_letter','nda','probation_completion','job_description','salary_certificate','salary_certificate_for_bank','raise_letter','promotion_letter','bonus_letter','compensation_review','vacation_request_letter','sick_leave_notice','maternity_leave_letter','paternity_leave_letter','hajj_leave_letter','bereavement_leave_letter','unpaid_leave_letter','return_to_work_letter','leave_approval_letter','leave_rejection_letter','verbal_warning','written_warning','final_warning','suspension_letter','disciplinary_notice','termination','noc','experience_letter','bank_loan_support_letter','visa_support_letter','dependent_visa_support','embassy_letter','property_rental_support','recommendation_letter','hrdf_letter','gosi_subscription_letter','saudization_letter','mudawana_amendment','loan_request_letter','salary_advance_letter','salary_advance_repayment_schedule','expense_reimbursement_letter','resignation_letter','resignation_acceptance','transfer_letter','relocation_letter','final_settlement_letter','exit_clearance_letter','retirement_letter','custom'],
          },
          subject: { type: 'string', description: 'Short subject line.' },
          context: { type: 'string', description: 'What happened / why this letter — used to draft the body.' },
          reference_clauses: { type: 'array', items: { type: 'string' }, description: 'Optional. Specific KSA Labour Law article numbers to cite.' },
          meta: {
            type: 'object',
            description: "Type-specific data the template uses. Examples: { amount, term_months, monthly_deduction, reason } for loan_request_letter | { new_salary, old_salary, effective_date, pct_increase } for raise_letter | { new_title, new_department, effective_date, new_salary } for promotion_letter | { start_date, end_date, days, coverage } for vacation_request_letter | { last_working_day, reason } for resignation_acceptance | { eosb_amount, years_served, unused_leave_days, unused_leave_value, pending_salary, other_dues, deductions, net_total } for final_settlement_letter | { bank_name } for salary_certificate_for_bank | { embassy, travel_purpose, travel_dates } for visa_support_letter. Pass any keys the template can use — unknown keys are ignored.",
            additionalProperties: true,
          },
        },
        required: ['letter_type', 'subject'],
      },
    },
  },

  // ------- HR documents (F12) --------
  {
    type: 'function',
    function: {
      name: 'add_hr_document',
      description:
        "Record an HR document upload (passport / iqama / visa / national_id / employment contract / GOSI cert / etc.). When admin forwards a document PDF or photo to the agent, extract the OCR text + expiry date if visible + document number, then call this. The expiry watchdog (F1) auto-tracks the new entry.",
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          doc_type: { type: 'string', enum: ['passport','iqama','visa','national_id','employment_contract','gosi_certificate','medical_insurance','driving_license','certificate','other'] },
          file_url: { type: 'string' },
          file_path: { type: 'string', description: 'Storage path. Required if file_url is not directly under content-uploads bucket.' },
          doc_number: { type: 'string' },
          issue_date: { type: 'string' },
          expiry_date: { type: 'string' },
          notes: { type: 'string' },
          ocr_text: { type: 'string' },
        },
        required: ['doc_type', 'file_url'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_hr_documents',
      description: 'List HR documents for one employee or all expiring within a window.',
      parameters: {
        type: 'object',
        properties: {
          employee_id: { type: 'string' },
          doc_type: { type: 'string' },
          expiring_within_days: { type: 'integer', description: 'Filter to docs expiring within N days.' },
        },
      },
    },
  },

  // ============================================================================
  // EMPLOYEE SELF-SERVICE — Every tool below auto-resolves the caller from the
  // sender's WhatsApp phone → team_members.whatsapp, and ALWAYS scopes the
  // query to that employee. There is no way for an employee to read someone
  // else's data. Anyone DM'ing the bot can use these regardless of admin role.
  // ============================================================================
  {
    type: 'function',
    function: {
      name: 'my_expiries',
      description:
        "Show the caller their own document-expiry timeline — iqama, passport, visa, plus any HR documents on file with an expiry date. Use when an employee asks \"when does my iqama expire?\" / \"check my visa date\" / \"كم باقي على إقامتي\".",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_leaves',
      description: "Show the caller's own leave history (approved / pending / rejected) and their current annual_leave_balance. \"show me my leaves\", \"have I taken any sick days this year?\".",
      parameters: {
        type: 'object',
        properties: { limit: { type: 'integer', description: 'Default 10' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_leave_balance',
      description: "Just the caller's remaining annual leave + days used this year. Quick lookup for \"how many leave days do I have left?\".",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_payroll',
      description: "List the caller's recent payslips (last N months). Use for \"show me my payslips\", \"have I been paid this month?\".",
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
          limit: { type: 'integer', description: 'Default 6' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_pay_breakdown',
      description: "Show the caller's payroll breakdown for a specific month — every line item (base, allowances, GOSI, unpaid leave, EOSB accrual). Default = current month. Use for \"what's in my payslip?\", \"explain my deductions\".",
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_eosb',
      description: "Show the caller their accrued end-of-service balance per KSA labour law (0.5 month/yr first 5 years, 1.0 month/yr after). Use for \"what's my end-of-service?\", \"كم مكافأتي\".",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_my_salary_slip',
      description: "Re-send the caller's salary slip via WhatsApp + email for a given month. Default = most recent paid month. Use when employee says \"send me my last payslip\", \"I lost my March slip\".",
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
          channel: { type: 'string', enum: ['whatsapp', 'email', 'both'] },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_onboarding',
      description: "Show the caller's own onboarding checklist + progress. Use for \"what's left on my onboarding?\", \"show me my checklist\".",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'complete_my_onboarding_item',
      description: "Mark one of the caller's own onboarding items as done. Use when employee says \"I signed the NDA\", \"submitted my IBAN\", \"done with the bank form\". The tool only accepts items belonging to the caller — admin override is automatic if the caller is admin.",
      parameters: {
        type: 'object',
        properties: { item_id: { type: 'string', description: 'The onboarding_checklist_items.id — call my_onboarding first to find the right id.' } },
        required: ['item_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_performance',
      description: "Generate the caller's own performance brief (last N days). Same as performance_brief but pre-scoped to the caller — for self-review or peeking at \"how am I doing this month?\".",
      parameters: {
        type: 'object',
        properties: { days: { type: 'integer', description: 'Default 30' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_attendance',
      description: "Show the caller's own attendance for a given month — every check-in / WFH / late entry. Default = current month.",
      parameters: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          month: { type: 'integer' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'request_hr_letter',
      description: "Employee asks the bot to draft an HR letter for them. Use when employee says \"I need a salary certificate for my visa\", \"can you make me an employment letter for the bank?\", \"خطاب تعريف بالراتب من فضلك\", \"I need an NOC to drive a rental car\", \"experience letter for my CV\", etc. Creates a DRAFT in hr_letters + notifies admin to review + sign. Self-service for employees (no admin needed). For destructive letters (warnings, terminations) use draft_hr_letter — that's admin-only.",
      parameters: {
        type: 'object',
        properties: {
          letter_type: {
            type: 'string',
            description: 'Which document. Employee can self-request these.',
            enum: ['salary_certificate','salary_certificate_for_bank','employment_letter','noc','experience_letter','bank_loan_support_letter','visa_support_letter','dependent_visa_support','embassy_letter','property_rental_support','recommendation_letter','hrdf_letter','gosi_subscription_letter','vacation_request_letter','return_to_work_letter','resignation_letter','custom'],
          },
          subject: { type: 'string', description: 'Optional. If omitted, defaults to "<letter type> for <employee name>".' },
          reason: { type: 'string', description: 'Why do they need it? (e.g. "for visa renewal", "bank loan application", "property rental"). Helps admin contextualize + becomes the letter context.' },
          meta: {
            type: 'object',
            description: 'Type-specific data. For bank/visa/embassy letters: { bank_name, embassy, travel_purpose, travel_dates }. For dependent visa: { dependents: "wife, 2 children" }. For rental: { landlord }.',
            additionalProperties: true,
          },
        },
        required: ['letter_type'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_letters',
      description: "List letters the company has issued to the caller (or that they\\'ve requested but are still in draft).",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_documents',
      description: "List the caller's documents on file — passport / iqama / visa scans, contracts, certs. Read-only.",
      parameters: { type: 'object', properties: {} },
    },
  },

  // =========================================================================
  // LOAN / SALARY ADVANCE — employee submits, admin approves on /hr/loans,
  // deduction flows into payroll.
  // =========================================================================
  {
    type: 'function',
    function: {
      name: 'request_loan',
      description: "Submit a salary loan / advance request. Use when employee says \"I need a loan of 10000 SAR for 6 months\", \"can I get a 5000 salary advance\", \"أبغى سلفة\", \"borrow against my salary\". Auto-resolves the employee from the WhatsApp sender, creates an hr_loan_requests row + a formal loan_request_letter draft, notifies admin to review on /hr/loans. Enforces KSA Labour Law Article 92: max 50% of base salary as monthly deduction.",
      parameters: {
        type: 'object',
        properties: {
          amount: { type: 'number', description: 'Amount requested in employee\'s salary currency.' },
          term_months: { type: 'integer', description: 'Repayment period in months (1..60).' },
          reason: { type: 'string', description: 'Why they need the loan (medical, home, education, emergency, etc.). Helps admin decision.' },
          first_deduction_month: { type: 'integer', description: 'Optional 1-12. Defaults to next month.' },
          first_deduction_year: { type: 'integer', description: 'Optional. Defaults to current year (or next year if month wraps).' },
          override_employee_id: { type: 'string', description: 'Admin only — file on behalf of another employee.' },
        },
        required: ['amount', 'term_months'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_loans',
      description: 'List loan requests. Use for "any pending loans?" / "show all loans" (admin) — auto-scoped to all employees. Or by status.',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['draft','submitted','approved','rejected','repaying','repaid','cancelled'] },
          employee_id: { type: 'string' },
          employee_name: { type: 'string' },
          limit: { type: 'integer', description: 'Default 25.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'approve_loan',
      description: 'Approve a pending loan request. Admin-only. Once approved, the system auto-writes monthly deduction lines into payroll_line_items for the next N months.',
      parameters: {
        type: 'object',
        properties: {
          loan_id: { type: 'string', description: 'hr_loan_requests.id (UUID).' },
          decision_note: { type: 'string', description: 'Optional note shown to employee.' },
        },
        required: ['loan_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'reject_loan',
      description: 'Reject a pending loan request. Admin-only.',
      parameters: {
        type: 'object',
        properties: {
          loan_id: { type: 'string' },
          decision_note: { type: 'string', description: 'Reason — required.' },
        },
        required: ['loan_id', 'decision_note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'my_loans',
      description: "Caller's own loan history + remaining balance. Use for \"show me my loans\", \"how much do I still owe\", \"كم باقي لي على السلفة\".",
      parameters: { type: 'object', properties: {} },
    },
  },

  // =========================================================================
  // SICK LEAVE with doctor note (special case of leave_requests)
  // =========================================================================
  {
    type: 'function',
    function: {
      name: 'submit_sick_leave',
      description: "Convenience wrapper around request_leave_for_self for sick leave with an attached doctor's note. Use when employee says \"I'm sick today, here's my doctor note\", \"I'll be off the next 3 days, medical certificate attached\", \"مرضت اليوم\". If they forwarded a PDF / image, pass its url as doctor_note_url. Creates the leave_requests row + sick_leave_notice letter draft + admin notification.",
      parameters: {
        type: 'object',
        properties: {
          start_date: { type: 'string', description: 'ISO YYYY-MM-DD. Required.' },
          end_date: { type: 'string', description: 'ISO. Defaults to start_date.' },
          reason: { type: 'string', description: 'Optional brief description (cold, surgery, etc.).' },
          doctor_note_url: { type: 'string', description: 'URL of the uploaded medical certificate (from the [uploaded_document: …] or [uploaded_image: …] tag).' },
          doctor_note_filename: { type: 'string', description: 'Optional original filename.' },
        },
        required: ['start_date'],
      },
    },
  },
]

// =============================================================================
// AGENCY SETTINGS (one-row config table — agency name, support email, etc.)
// =============================================================================

const settingsTools = [
  {
    type: 'function',
    function: {
      name: 'get_agency_settings',
      description:
        'Read the agency-wide settings: agency_name, support_email, whatsapp_provider. The encrypted token is never returned.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_agency_settings',
      description:
        'Update one or more agency settings. Only include the fields you want to change. The token is stored encrypted; pass `whatsapp_api_token` to rotate.',
      parameters: {
        type: 'object',
        properties: {
          agency_name: { type: 'string' },
          support_email: { type: 'string' },
          whatsapp_provider: {
            type: 'string',
            enum: ['twilio', 'meta', 'apiwha'],
            description: 'API provider used for outbound notifications.',
          },
          whatsapp_api_token: {
            type: 'string',
            description: 'New API token to store. Encrypted server-side.',
          },
        },
      },
    },
  },
]

// =============================================================================
// POWER TOOLS — generic database access + code execution
// =============================================================================
// Tier-1: structured DB ops (db_select / insert / update / delete / count) +
// raw SQL escape hatches (db_query for SELECT, db_migrate for DDL/DML).
// Tier-2: run_code, a Node vm-sandboxed JS runner with the Supabase
// service-role client pre-injected.
//
// Destructive ops (db_delete with broad filters, db_migrate of any kind,
// run_code that mutates data) MUST be confirmed with the user in chat
// before the agent calls them — see the "Power tools — confirmation
// rules" section in the system prompt.

const powerTools = [
  {
    type: 'function',
    function: {
      name: 'db_describe',
      description:
        'Returns the live database schema (table names, columns, types, defaults) by querying information_schema. Use this BEFORE any other power tool when you don\'t already know the table/column you need.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_select',
      description:
        'Read rows from any public-schema table. Filters are an array of {column, op, value} where op is one of eq, neq, gt, gte, lt, lte, like, ilike, in, is. Use db_describe first if unsure of the table.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', description: 'Table name (in public schema).' },
          columns: { type: 'string', description: 'Comma-separated columns or "*". Default "*".' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
                value: {},
              },
              required: ['column', 'op', 'value'],
            },
          },
          order_by: { type: 'string' },
          ascending: { type: 'boolean', description: 'Default true.' },
          limit: { type: 'number' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_insert',
      description: 'Insert one or more rows into a public-schema table. Returns the inserted rows.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          data: {
            description: 'Single row object or array of row objects.',
          },
        },
        required: ['table', 'data'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_update',
      description: 'Update rows in a public-schema table matching the filters. Returns updated rows.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
                value: {},
              },
              required: ['column', 'op', 'value'],
            },
          },
          patch: { type: 'object', description: 'Fields to set, e.g. { status: "active" }.' },
        },
        required: ['table', 'filters', 'patch'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_delete',
      description:
        'Delete rows from a public-schema table matching the filters. DESTRUCTIVE — confirm with user first by summarising what will be removed.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
                value: {},
              },
              required: ['column', 'op', 'value'],
            },
          },
        },
        required: ['table', 'filters'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_count',
      description: 'Count rows in a table matching optional filters.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string' },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is'] },
                value: {},
              },
              required: ['column', 'op', 'value'],
            },
          },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_query',
      description:
        'Run an arbitrary SELECT against the database for joins / aggregations / window functions / cross-table queries that don\'t fit db_select. Read-only. Returns an array of row objects. Wraps SQL through the agent_query RPC.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A single SELECT statement (no trailing semicolon needed).' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'db_migrate',
      description:
        'Run arbitrary DDL or DML — ALTER TABLE, CREATE INDEX, CREATE TABLE, bulk INSERT/UPDATE/DELETE, etc. DESTRUCTIVE/SCHEMA-LEVEL — ALWAYS describe the change to the user and wait for explicit confirmation ("yes", "go", "do it") before calling. Wraps SQL through the agent_migrate RPC.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'A single SQL statement (no trailing semicolon needed).' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_code',
      description:
        'Execute JavaScript in a Node vm sandbox with these globals available: `supabase` (Supabase service-role client, exposes .from(), .rpc(), .auth.admin, .storage), `fetch`, `console.log/error`, `Buffer`. Code MUST be an async expression — wrap multi-step logic in (async () => { ... })() and the return value will be sent back. Capture intermediate output with console.log. 30-second timeout. Use this when a single SQL query / structured tool can\'t express the work (multi-step transformations, calls to external APIs, etc.). For data mutations, describe what the code will do and confirm with user first.',
      parameters: {
        type: 'object',
        properties: {
          code: {
            type: 'string',
            description:
              'JavaScript expression. Example: "const { data } = await supabase.from(\\"clients\\").select(\\"id, company_name\\"); return data.length;"',
          },
        },
        required: ['code'],
      },
    },
  },
]

// =============================================================================
// DEVELOPER-MODE TOOLS — file system + shell access on the user's laptop
// =============================================================================
// These let the agent behave like a coding assistant: open files, edit
// them, run builds/tests, push commits. The project root is the
// dashboard repo (the directory that contains src/, whatsapp-agent/,
// package.json, etc.). Paths can be relative to that root or absolute.

const devTools = [
  {
    type: 'function',
    function: {
      name: 'project_root',
      description:
        'Get the absolute path of the dashboard project root + the host OS platform. Call this once at the start of a developer-mode turn so you know where you are and can craft correct relative paths. No arguments.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description:
        'Read a text file from the laptop. Paths can be relative to the project root or absolute. Returns the content with 1-based line numbers prefixed. Use `offset` + `limit` to page through large files. ALWAYS read a file before editing it so old_string matches exactly.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path. Relative to project root if not absolute.' },
          offset: { type: 'integer', description: 'Optional. 0-based line to start at.' },
          limit: { type: 'integer', description: 'Optional. Max lines to read (default 2000).' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_file',
      description:
        'WRITE a file (creates it or overwrites it whole). DESTRUCTIVE for existing files — for surgical changes use edit_file instead. Use write_file only for brand-new files or when you genuinely want to replace the whole content. Creates parent directories as needed.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string', description: 'Full file content.' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit_file',
      description:
        'SURGICAL edit — replace exactly `old_string` with `new_string`. Requires old_string to be unique in the file (extend the snippet with surrounding context if needed) unless replace_all=true. Reads must match exactly including whitespace; read the file first so you know the precise indentation. Errors loudly if old_string is not found or is non-unique without replace_all.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          old_string: { type: 'string' },
          new_string: { type: 'string' },
          replace_all: { type: 'boolean', description: 'Optional. Replace every occurrence. Default false.' },
        },
        required: ['path', 'old_string', 'new_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_dir',
      description: 'List a directory\'s entries. Directories first, then files, both alphabetical.',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'Defaults to project root.' } },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'glob_files',
      description:
        'Recursively find files by glob pattern. Skips .git, node_modules, .next, dist, .turbo. ** matches any segments, * matches one segment, ? matches one char.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'e.g. "src/**/*.tsx", "*.md".' },
          cwd: { type: 'string', description: 'Directory to search in. Defaults to project root.' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'grep_files',
      description:
        'Search file contents for a regex pattern. Uses ripgrep when available, falls back to a JS scanner. Returns up to 200 file:line:content matches.',
      parameters: {
        type: 'object',
        properties: {
          pattern: { type: 'string', description: 'Regex pattern.' },
          path: { type: 'string', description: 'Directory to search. Defaults to project root.' },
          glob: { type: 'string', description: 'Optional file-name glob filter, e.g. "*.tsx".' },
          case_insensitive: { type: 'boolean' },
          max: { type: 'integer' },
        },
        required: ['pattern'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'run_shell',
      description:
        'Execute a shell command on the user\'s laptop and return stdout/stderr. PowerShell on Windows, /bin/sh on POSIX. Default cwd is the project root. Default timeout 60s; use a longer timeout_ms for builds. Use this for git, npm, node, tsc, curl — anything that isn\'t covered by a dedicated tool. DESTRUCTIVE for anything that mutates state (rm, git push, npm publish, db scripts) — describe what you\'re about to run and wait for confirmation on destructive commands.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' },
          timeout_ms: { type: 'integer' },
        },
        required: ['command'],
      },
    },
  },
]

// =============================================================================

export const tools = [
  ...memoryTools,
  ...quotationTools,
  ...clientsTools,
  ...remindersTools,
  ...tasksTools,
  ...contractsTools,
  ...contractPaymentTools,
  ...socialAccountsTools,
  ...campaignsTools,
  ...teamTools,
  ...commLogTools,
  ...outboundWhatsappTools,
  ...clientServicesTools,
  ...notificationTools,
  ...contentItemTools,
  ...clientFileTools,
  ...weeklyReportTools,
  ...settingsTools,
  ...accountingTools,
  ...nagsTools,
  ...billsTools,
  ...hrTools,
  ...powerTools,
  ...devTools,
]
