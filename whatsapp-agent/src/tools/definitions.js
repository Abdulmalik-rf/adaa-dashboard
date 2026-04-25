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
        'Start a new weekly client report. Auto-generates report_number (WR-YYYY-Wnn). After creating, use add_report_kpi / add_report_platform / add_report_content / add_report_campaign / add_report_task to fill in sections. Call render_weekly_report_pdf at the end to send it to the user.',
      parameters: {
        type: 'object',
        properties: {
          client_company_name: {
            type: 'string',
            description: 'Client company name. Resolved to client_id; also used for the cover.',
          },
          period_start: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to last Monday.' },
          period_end: { type: 'string', description: 'ISO YYYY-MM-DD. Defaults to today.' },
          summary: { type: 'string', description: 'Executive summary paragraph.' },
          notes: { type: 'string', description: 'Notes & recommendations paragraph.' },
          prepared_for_contact: { type: 'string', description: 'e.g. "Ahmed Al-Rashid (Marketing Lead)".' },
          prepared_for_meta: { type: 'string', description: 'e.g. "Tech / B2B SaaS".' },
          prepared_for_email: { type: 'string' },
        },
        required: ['client_company_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'find_weekly_report',
      description: 'Search reports by report_number substring or client name. Returns up to 5 matches.',
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
      description: 'Edit the cover/summary/notes of a report. For section data use the dedicated add_report_* / remove_report_* tools.',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          period_start: { type: 'string' },
          period_end: { type: 'string' },
          summary: { type: 'string' },
          notes: { type: 'string' },
          prepared_for_contact: { type: 'string' },
          prepared_for_meta: { type: 'string' },
          prepared_for_email: { type: 'string' },
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
  // ---------- KPI cards ----------
  {
    type: 'function',
    function: {
      name: 'add_report_kpi',
      description: 'Append a KPI card to the report (the 4-card snapshot row). Up to 4 cards render comfortably; a 5th will wrap.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          label: { type: 'string', description: 'e.g. "Total Followers", "Reach", "Ad Spend".' },
          value: { type: 'string', description: 'Display value, e.g. "63.7K", "4.8%", "3,840 SAR".' },
          delta_label: { type: 'string', description: 'e.g. "+412 (+0.6%)" or "on plan".' },
          delta_direction: { type: 'string', enum: ['up', 'down', 'flat'] },
        },
        required: ['report_id', 'label', 'value'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_kpi',
      description: 'Remove one KPI card by zero-based index.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          index: { type: 'number' },
        },
        required: ['report_id', 'index'],
      },
    },
  },
  // ---------- Social platforms ----------
  {
    type: 'function',
    function: {
      name: 'add_report_platform',
      description: 'Append a platform row (Instagram, TikTok, etc.) to the Social Media Performance table.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          platform: { type: 'string', description: 'e.g. "Instagram", "TikTok", "Snapchat".' },
          dot_color: { type: 'string', description: 'CSS color for the platform dot, e.g. "#E1306C".' },
          followers: { type: 'number' },
          delta_followers: { type: 'number', description: 'Net follower change for the period.' },
          posts_count: { type: 'number' },
          reach: { type: 'number' },
          engagement_rate: { type: 'number', description: 'As a percent, e.g. 5.4 for 5.4%.' },
        },
        required: ['report_id', 'platform'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_platform',
      description: 'Remove one platform row by zero-based index.',
      parameters: {
        type: 'object',
        properties: { report_id: { type: 'string' }, index: { type: 'number' } },
        required: ['report_id', 'index'],
      },
    },
  },
  // ---------- Content delivered ----------
  {
    type: 'function',
    function: {
      name: 'add_report_content',
      description:
        'Append a content row (post/reel/carousel/story/ad). Pass media_url to embed a thumbnail — use upload_image first to get a URL if you only have the file.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          title: { type: 'string' },
          platform: { type: 'string' },
          content_type: { type: 'string', description: 'e.g. "Reel", "Carousel", "Story", "Ad".' },
          campaign_label: { type: 'string', description: 'e.g. "Spring 2026", "Always-on".' },
          publish_date: { type: 'string', description: 'ISO YYYY-MM-DD or display string.' },
          media_url: { type: 'string', description: 'Public URL of the thumbnail image.' },
          status: { type: 'string', enum: ['published', 'scheduled', 'draft', 'paused'] },
        },
        required: ['report_id', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_content',
      description: 'Remove one content row by zero-based index.',
      parameters: {
        type: 'object',
        properties: { report_id: { type: 'string' }, index: { type: 'number' } },
        required: ['report_id', 'index'],
      },
    },
  },
  // ---------- Campaigns ----------
  {
    type: 'function',
    function: {
      name: 'add_report_campaign',
      description: 'Append a campaign row to the Active Campaigns table.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          name: { type: 'string' },
          platform: { type: 'string', description: 'e.g. "Meta", "Google Ads", "TikTok Ads".' },
          objective: { type: 'string', description: 'e.g. "Leads", "Reach", "Conversions".' },
          spend: { type: 'number' },
          currency: { type: 'string', description: 'Defaults to "SAR".' },
          result: { type: 'string', description: 'Free-form, e.g. "154 leads · 18.4 SAR CPL".' },
          status: { type: 'string', enum: ['live', 'paused', 'ended'] },
        },
        required: ['report_id', 'name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_campaign',
      description: 'Remove one campaign row by zero-based index.',
      parameters: {
        type: 'object',
        properties: { report_id: { type: 'string' }, index: { type: 'number' } },
        required: ['report_id', 'index'],
      },
    },
  },
  // ---------- Tasks done / plan ----------
  {
    type: 'function',
    function: {
      name: 'add_report_task',
      description:
        'Append an item to either Tasks Completed (kind="done") or Next Week\'s Plan (kind="plan").',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          kind: { type: 'string', enum: ['done', 'plan'] },
          title: { type: 'string' },
          owner: { type: 'string', description: 'Display name of the person responsible.' },
          date_label: { type: 'string', description: 'e.g. "Apr 20" or "Due May 1".' },
        },
        required: ['report_id', 'kind', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_report_task',
      description: 'Remove a task line by kind + zero-based index.',
      parameters: {
        type: 'object',
        properties: {
          report_id: { type: 'string' },
          kind: { type: 'string', enum: ['done', 'plan'] },
          index: { type: 'number' },
        },
        required: ['report_id', 'kind', 'index'],
      },
    },
  },
  // ---------- Image upload ----------
  {
    type: 'function',
    function: {
      name: 'upload_image',
      description:
        'Upload an image to the report-images bucket and return its public URL. Pass either a remote `image_url` (the agent will fetch and re-host it) OR a base64-encoded `image_data` with `mime` (when you have raw bytes from a WhatsApp/chat attachment). Returns { public_url } that you can pass to add_report_content.media_url etc.',
      parameters: {
        type: 'object',
        properties: {
          image_url: { type: 'string', description: 'Existing URL to fetch and re-host.' },
          image_data: { type: 'string', description: 'Base64-encoded image bytes.' },
          mime: { type: 'string', description: 'e.g. "image/png", "image/jpeg". Required when using image_data.' },
          filename_hint: { type: 'string', description: 'Optional human label, e.g. "spring-promo-thumb".' },
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
  ...clientServicesTools,
  ...notificationTools,
  ...contentItemTools,
  ...clientFileTools,
  ...weeklyReportTools,
  ...settingsTools,
]
