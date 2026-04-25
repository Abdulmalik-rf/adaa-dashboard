// @ts-nocheck — ported verbatim from the JS agent to keep them in sync.
// OpenAI-format tool definitions, grouped by entity. To extend: add a tool
// block here and a matching executor in executors.ts.

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
        'Create a reminder. The agent will send the user a WhatsApp message at the due date+time. Use for "remind me at 3pm", "follow up on X on Monday", etc.',
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
      description: 'Create a task. Optionally pass contract_title to link the task to a contract — the executor resolves it. Tasks linked to a contract show under that contract\'s "Delivery schedule" on the client page.',
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
            description: 'Optional. Title (or substring) of the contract this task delivers.',
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
      description: 'Update a task. Set status to "completed" to mark done.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          status: { type: 'string', enum: ['todo', 'in_progress', 'review', 'completed'] },
          due_date: { type: 'string' },
          contract_id: { type: 'string', description: 'Pass id to link, null/empty to unlink.' },
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
          scope: { type: 'string', description: 'Long-form description of what the contract covers — appears on the client detail page under "What this covers".' },
          file_url: { type: 'string', description: 'Public URL to the signed contract PDF.' },
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
        'Attach a social media account (Instagram, TikTok, Snapchat, etc.) to a client. Use find_client first to get the client_id.',
      parameters: {
        type: 'object',
        properties: {
          client_id: { type: 'string' },
          platform: { type: 'string', description: 'e.g. "instagram", "tiktok", "snapchat".' },
          username: { type: 'string' },
          url: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'needs_attention'] },
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
        'Find a client\'s social accounts. Pass client_id to list all accounts for that client.',
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
      description: 'Update a social account.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          username: { type: 'string' },
          url: { type: 'string' },
          notes: { type: 'string' },
          status: { type: 'string', enum: ['active', 'inactive', 'needs_attention'] },
        },
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
      description: 'Add one row to a contract\'s payment schedule.',
      parameters: {
        type: 'object',
        properties: {
          contract_id: { type: 'string' },
          amount: { type: 'number' },
          due_date: { type: 'string' },
          paid_date: { type: 'string' },
          status: { type: 'string', enum: ['pending', 'paid', 'overdue', 'cancelled'] },
          method: { type: 'string' },
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
      description: 'Set a payment row to status="paid" and stamp paid_date (defaults to today).',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          paid_date: { type: 'string' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'update_contract_payment',
      description: 'Update fields on a contract payment row.',
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
      description: 'List payments for a contract.',
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
      description: 'Delete a payment row. DESTRUCTIVE — confirm first.',
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
      description: 'Attach an existing task to a contract. Pass contract_id=null to unlink.',
      parameters: {
        type: 'object',
        properties: {
          task_id: { type: 'string' },
          contract_id: { type: 'string' },
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
        'Create a new quotation (price estimate document). Auto-generates the quote number (Q-YYYY-NNN). Only client-facing fields are required — company info (Adaa VAT/CR/address/phone/email) and payment terms default to Adaa\'s standard values. After creating, you MUST call add_quotation_item for each line item the user mentioned.',
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
]

// NOTE: send_quotation_pdf and long-term memory tools exist in the WhatsApp
// agent but are intentionally NOT exposed here — PDF gen needs puppeteer
// (won't run on Hostinger's shared Node runtime) and cross-session memory
// would need persistent storage (future work).

// =============================================================================

export const tools = [
  ...quotationTools,
  ...contractPaymentTools,
  ...clientsTools,
  ...remindersTools,
  ...tasksTools,
  ...contractsTools,
  ...socialAccountsTools,
  ...campaignsTools,
  ...teamTools,
  ...commLogTools,
  ...clientServicesTools,
]
