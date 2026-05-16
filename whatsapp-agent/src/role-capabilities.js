// Single source of truth for "what can each role do?".
// Used by:
//   • src/index.js  — classifies senders and tags context.senderRole
//   • tools/executors.js — _requireRole() gates destructive tools by role
//   • agent.js — systemInstructions() injects a role-aware preamble so GPT
//                picks the right tools on the first try
//
// Roles are stored in team_members.role. Anyone not in team_members is 'public'.

export const ROLES = ['admin', 'hr', 'finance', 'manager', 'staff', 'public']

export const ROLE_LABELS = {
  admin:   { en: 'Admin / Owner',        ar: 'مدير عام / مالك' },
  hr:      { en: 'HR Specialist / Manager', ar: 'متخصص / مدير موارد بشرية' },
  finance: { en: 'Finance / Accountant', ar: 'مالية / محاسب' },
  manager: { en: 'Department Manager',   ar: 'مدير قسم' },
  staff:   { en: 'Staff',                ar: 'موظف' },
  public:  { en: 'Public Contact',       ar: 'متصل خارجي' },
}

// Tool-name allow-list per role. Anyone in admin gets EVERYTHING — that's
// the implicit superset, so we don't list admin here. For other roles, the
// list below names the destructive/cross-employee tools they're allowed to
// call on top of the universal employee self-service tools (my_*, etc.).
//
// Naming: keep this in sync with src/tools/executors.js registry keys.
export const ROLE_TOOLS = {
  hr: new Set([
    // Leave
    'approve_leave', 'reject_leave', 'check_leave_conflicts', 'find_leave_requests',
    // Payroll
    'generate_payroll', 'mark_payroll_paid', 'find_payroll', 'send_salary_slip', 'compute_eosb',
    // Onboarding
    'start_onboarding', 'mark_onboarding_item_done',
    // Candidates
    'add_candidate', 'find_candidates', 'promote_candidate_to_employee',
    // Letters
    'draft_hr_letter',
    // Documents
    'add_hr_document', 'find_hr_documents',
    // Loans
    'find_loans', 'approve_loan', 'reject_loan',
    // Attendance + performance
    'attendance_report', 'log_attendance', 'performance_brief',
    // Nags (overdue invoice reminders are HR-adjacent for chasing payments
    // when HR also handles AR — admin can override)
    'find_pending_nags', 'send_nag', 'skip_nag',
    // Team management
    'add_team_member', 'find_team_member', 'update_team_member',
  ]),

  finance: new Set([
    // Invoices
    'create_draft_invoice', 'find_invoices', 'approve_invoice', 'push_invoice',
    // Bills
    'create_draft_bill', 'find_bills', 'approve_bill', 'push_bill', 'suggest_bill_category',
    // Payroll approval
    'mark_payroll_paid', 'find_payroll', 'send_salary_slip',
    // Loans (finance signs off on the disbursement)
    'find_loans', 'approve_loan', 'reject_loan',
    // Contract payments
    'add_contract_payment', 'mark_payment_paid', 'update_contract_payment',
    'find_contract_payments', 'delete_contract_payment',
    // Overdue nags
    'find_pending_nags', 'send_nag', 'skip_nag',
  ]),

  manager: new Set([
    // Manager can approve their own team's leaves + see their team's data.
    // The "own team" filter is enforced at the executor level (TODO — for
    // now they get the same surface as HR but in practice should restrict
    // to direct reports via team_members.manager_id; the agent prompt
    // warns them).
    'approve_leave', 'reject_leave', 'check_leave_conflicts', 'find_leave_requests',
    'find_payroll',
    'performance_brief',
    'attendance_report',
    'find_team_member',
    // Letters — managers can request on behalf of their team (uses request_*
    // which is open to all employees) but can't draft destructive ones.
  ]),

  staff: new Set([
    // Staff get ZERO admin tools. Their access is the universal employee
    // self-service surface (my_*, request_*) which doesn't go through this
    // gate. So this set stays empty by design.
  ]),

  public: new Set([
    // Public users get zero destructive tools. The agent prompt also locks
    // them to customer-service responses.
  ]),
}

// Universal self-service tools — anyone with an employee record can call
// these on their own data. Public users get blocked at the resolve step.
export const SELF_SERVICE_TOOLS = new Set([
  'my_expiries', 'my_leaves', 'my_leave_balance', 'my_payroll', 'my_pay_breakdown',
  'my_eosb', 'request_my_salary_slip', 'my_onboarding', 'complete_my_onboarding_item',
  'my_performance', 'my_attendance', 'my_letters', 'my_documents', 'my_loans',
  'request_leave_for_self', 'request_hr_letter', 'request_loan', 'submit_sick_leave',
  'log_attendance',
])

/** True when `role` is allowed to call `toolName`. Admin = always yes. */
export function roleCanCall(role, toolName) {
  if (role === 'admin') return true
  if (SELF_SERVICE_TOOLS.has(toolName)) return role !== 'public'
  const set = ROLE_TOOLS[role]
  return !!(set && set.has(toolName))
}

/** Pretty-print the tool list a role can use — for the agent system prompt. */
export function roleToolsBlock(role) {
  if (role === 'admin') return 'EVERY tool. No restrictions.'
  if (role === 'public') return 'NONE. Customer-service responses only.'
  const set = ROLE_TOOLS[role]
  const adminTools = set && set.size > 0 ? Array.from(set).sort().join(', ') : '(none beyond self-service)'
  const selfService = role === 'staff' || ROLE_TOOLS[role]
    ? 'PLUS the universal self-service surface (my_*, request_*, log_attendance).'
    : ''
  return `${adminTools}\n  ${selfService}`
}
