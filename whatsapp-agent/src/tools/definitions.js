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
      description: 'Create a task.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
          due_date: { type: 'string' },
          client_company_name: { type: 'string' },
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
          notes: { type: 'string' },
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
// TEAM MEMBERS
// =============================================================================

const teamTools = [
  {
    type: 'function',
    function: {
      name: 'add_team_member',
      description: 'Add a staff member to the team.',
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
      description: 'Update a team member.',
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

export const tools = [
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
