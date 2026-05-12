import { supabaseClient } from "@/lib/supabase/client"
import { getCurrentUser } from "@/lib/supabase/server"
import { CalendarClient } from "./CalendarClient"

export const revalidate = 30

// Aggregates every date-bearing entity in the dashboard into a single
// month-grid view: tasks (due_date), reminders (due_date), content_items
// (publish_date), contracts (start_date / end_date), weekly_reports
// (period_start / period_end), quotations (issue_date / valid_until).
// CalendarClient does the rendering; this page just queries.
//
// Role gating: tasks / contracts / quotations link to admin-only sections.
// For non-admins those event types are dropped from the aggregation so
// clicking an event never lands them on a route they can't access.

export default async function CalendarPage() {
  const me = await getCurrentUser()
  const isAdmin = me?.profile?.role === 'admin'

  const queries: Promise<any>[] = [
    (supabaseClient as any).from('reminders').select('id, title, due_date, due_time, priority, status, client_id'),
    (supabaseClient as any).from('content_items').select('id, title, platform, content_type, publish_date, publish_time, schedule_status, client_id'),
    (supabaseClient as any).from('weekly_reports').select('id, report_number, customer_name, customer_company, period_start, period_end, issue_date, status'),
    (supabaseClient as any).from('clients').select('id, company_name'),
  ]
  if (isAdmin) {
    queries.push(
      (supabaseClient as any).from('tasks').select('id, title, due_date, priority, status, client_id, assignee_id'),
      (supabaseClient as any).from('contracts').select('id, title, start_date, end_date, status, client_id'),
      (supabaseClient as any).from('quotations').select('id, quote_number, client_company, issue_date, valid_until, status'),
    )
  }

  const results = await Promise.all(queries)
  const reminders = results[0]?.data || []
  const contentItems = results[1]?.data || []
  const reports = results[2]?.data || []
  const clients = results[3]?.data || []
  const tasks = isAdmin ? (results[4]?.data || []) : []
  const contracts = isAdmin ? (results[5]?.data || []) : []
  const quotations = isAdmin ? (results[6]?.data || []) : []

  return (
    <CalendarClient
      tasks={tasks}
      reminders={reminders}
      contentItems={contentItems}
      contracts={contracts}
      reports={reports}
      quotations={quotations}
      clients={clients}
    />
  )
}
