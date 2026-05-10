"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { getCurrentUser } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

// Approval workflow:
//   - Admin marking "complete"           → status = 'completed'  (direct)
//   - Non-admin marking "complete"       → status = 'review'     (awaits admin approval)
//   - Admin clicks Approve in panel      → status = 'completed', assignee notified
//   - Admin clicks Reject in panel       → status = 'in_progress', assignee notified
//
// Notification types in flight:
//   task_pending_review  — admin-targeted, has Approve/Reject buttons
//   task_approved        — assignee-targeted, informational
//   task_rejected        — assignee-targeted, informational
//   task_completed       — global, audit log of admin completions
export async function markTaskCompleted(taskId: string, type: 'task' | 'content' = 'task', targetStatus: string = 'completed') {
  const table = type === 'content' ? 'content_items' : 'tasks'
  const statusField = type === 'content' ? 'task_status' : 'status'

  // Role check: non-admins go through 'review' instead of completed.
  // Reopens (targetStatus !== 'completed') bypass the gate.
  const me = await getCurrentUser()
  const isAdmin = me?.profile?.role === 'admin'
  const wantsToComplete = targetStatus === 'completed'
  const actualStatus = (wantsToComplete && !isAdmin) ? 'review' : targetStatus

  // 1. Update task
  const { data, error } = await (supabaseClient as any)
    .from(table)
    .update({
      [statusField]: actualStatus,
      completed_at: actualStatus === 'completed' ? new Date().toISOString() : null,
    })
    .eq('id', taskId)
    .select()

  if (error || !data || data.length === 0) {
    console.error(`Failed to update ${type}`, error)
    return
  }

  const itemName = data[0].title
  // 2. Notification path
  if (actualStatus === 'review') {
    // Non-admin submitted for review → notify admins (user_id: null = all admins)
    await (supabaseClient as any).from('notifications').insert({
      user_id: null,
      title: 'Task Pending Review',
      message: `"${itemName}" has been submitted for your approval. Approve or send back from the notifications panel.`,
      type: 'task_pending_review',
      related_id: taskId,
      is_read: false,
    })
  } else if (actualStatus === 'completed') {
    // Admin marked completed directly → audit log
    await (supabaseClient as any).from('notifications').insert({
      user_id: null,
      title: 'Task Completed',
      message: `Task/Content "${itemName}" has been marked as completed.`,
      type: 'task_completed',
      related_id: taskId,
      is_read: false,
    })
  }

  revalidatePath('/my-tasks')
  revalidatePath('/tasks')
  revalidatePath('/')
  revalidatePath('/notifications')
}

// Admin approves a task that was submitted for review.
// Moves task to 'completed', closes the pending-review notification, and
// pings the assignee with a 'task_approved' notification.
export async function approveTaskCompletion(taskId: string, type: 'task' | 'content' = 'task') {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    throw new Error('Only admins can approve task completions')
  }

  const table = type === 'content' ? 'content_items' : 'tasks'
  const statusField = type === 'content' ? 'task_status' : 'status'

  const { data, error } = await (supabaseClient as any)
    .from(table)
    .update({
      [statusField]: 'completed',
      completed_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
  if (error || !data || data.length === 0) throw new Error('Failed to approve')

  // Close out the pending-review notifications for this task
  await (supabaseClient as any).from('notifications')
    .update({ is_read: true })
    .eq('type', 'task_pending_review')
    .eq('related_id', taskId)

  // Notify the assignee (resolve their auth user_id from team_members)
  const assigneeId = data[0].assignee_id
  if (assigneeId) {
    const { data: tm } = await (supabaseClient as any)
      .from('team_members').select('user_id').eq('id', assigneeId).maybeSingle()
    await (supabaseClient as any).from('notifications').insert({
      user_id: tm?.user_id ?? null,
      title: 'Task Approved ✓',
      message: `Your completion of "${data[0].title}" has been approved.`,
      type: 'task_approved',
      related_id: taskId,
      is_read: false,
    })
  }

  revalidatePath('/my-tasks')
  revalidatePath('/tasks')
  revalidatePath('/')
  revalidatePath('/notifications')
}

// Admin rejects a task — sends it back to in_progress, closes the
// pending-review notification, and pings the assignee.
export async function rejectTaskCompletion(taskId: string, type: 'task' | 'content' = 'task') {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    throw new Error('Only admins can reject task completions')
  }

  const table = type === 'content' ? 'content_items' : 'tasks'
  const statusField = type === 'content' ? 'task_status' : 'status'

  const { data, error } = await (supabaseClient as any)
    .from(table)
    .update({
      [statusField]: 'in_progress',
      completed_at: null,
    })
    .eq('id', taskId)
    .select()
  if (error || !data || data.length === 0) throw new Error('Failed to reject')

  await (supabaseClient as any).from('notifications')
    .update({ is_read: true })
    .eq('type', 'task_pending_review')
    .eq('related_id', taskId)

  const assigneeId = data[0].assignee_id
  if (assigneeId) {
    const { data: tm } = await (supabaseClient as any)
      .from('team_members').select('user_id').eq('id', assigneeId).maybeSingle()
    await (supabaseClient as any).from('notifications').insert({
      user_id: tm?.user_id ?? null,
      title: 'Task Sent Back',
      message: `"${data[0].title}" was sent back — please continue working on it.`,
      type: 'task_rejected',
      related_id: taskId,
      is_read: false,
    })
  }

  revalidatePath('/my-tasks')
  revalidatePath('/tasks')
  revalidatePath('/')
  revalidatePath('/notifications')
}

export async function updateTaskStatus(taskId: string, status: string) {
  const { error, data } = await (supabaseClient as any)
    .from('tasks')
    .update({ status })
    .eq('id', taskId)
    .select()

  if (error) throw new Error("Failed")
  
  if (status === 'completed' && data?.[0]) {
    await (supabaseClient as any).from('notifications').insert({
      user_id: null,
      title: 'Task Completed',
      message: `Task "${data[0].title}" has been completed.`,
      type: 'task_completed',
      related_id: taskId,
      is_read: false
    })
  }
  
  revalidatePath('/tasks')
  revalidatePath('/my-tasks')
  revalidatePath('/notifications')
}

export async function deleteTask(taskId: string) {
  const { error } = await (supabaseClient as any)
    .from('tasks')
    .delete()
    .eq('id', taskId)

  if (error) throw new Error("Failed")
  revalidatePath('/tasks')
}

export async function createTask(formData: FormData) {
  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const priority = formData.get('priority') as string
  const status = formData.get('status') as string || 'todo'
  const assignee_id = formData.get('assignee_id') as string
  const client_id = formData.get('client_id') as string
  const due_date = formData.get('due_date') as string

  const { data, error } = await (supabaseClient as any)
    .from('tasks')
    .insert({
      title,
      description,
      priority,
      status,
      assignee_id,
      client_id,
      due_date
    })
    .select()

  if (error) throw new Error("Failed")

  if (assignee_id) {
    const { data: tm } = await (supabaseClient as any)
      .from('team_members').select('user_id').eq('id', assignee_id).maybeSingle()
    await (supabaseClient as any).from('notifications').insert({
      user_id: tm?.user_id ?? null,
      title: 'New Task Assigned',
      message: `You have been assigned: ${title}`,
      type: 'task_assigned',
      related_id: data[0].id,
      is_read: false,
    })
  }

  revalidatePath('/tasks')
  revalidatePath('/my-tasks')
  revalidatePath('/my-dashboard')
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}


export async function createContentItem(formData: FormData, platform: string) {
  const title = formData.get('title') as string
  const caption = formData.get('caption') as string
  const content_type = formData.get('content_type') as string
  const publish_date = formData.get('publish_date') as string
  const publish_time = formData.get('publish_time') as string
  const assignee_id = formData.get('assignee_id') as string

  // Insert content
  const { data, error } = await (supabaseClient as any)
    .from('content_items')
    .insert({
      platform,
      title,
      caption,
      content_type,
      publish_date,
      publish_time,
      schedule_status: 'pending',
      task_status: 'not_started',
      assignee_id
    })
    .select()

  if (!error && data && data.length > 0) {
    let notifyUserId: string | null = null
    if (assignee_id) {
      const { data: tm } = await (supabaseClient as any)
        .from('team_members').select('user_id').eq('id', assignee_id).maybeSingle()
      notifyUserId = tm?.user_id ?? null
    }
    await (supabaseClient as any)
      .from('notifications')
      .insert({
        user_id: notifyUserId,
        title: 'New Content Assigned',
        message: `You have been assigned to prepare: ${title}`,
        type: 'task_assigned',
        related_id: data[0].id,
        is_read: false
      })
  }

  revalidatePath('/my-dashboard')
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}

export async function updateTaskAssignee(id: string, assignee_id: string) {
  const { data, error } = await (supabaseClient as any)
    .from('tasks')
    .update({ assignee_id })
    .eq('id', id)
    .select()

  if (error) throw new Error('Failed')

  if (assignee_id && data?.[0]) {
    const { data: tm } = await (supabaseClient as any)
      .from('team_members').select('user_id').eq('id', assignee_id).maybeSingle()
    await (supabaseClient as any).from('notifications').insert({
      user_id: tm?.user_id ?? null,
      title: 'Task Reassigned',
      message: `You have been assigned: ${data[0].title}`,
      type: 'task_assigned',
      related_id: id,
      is_read: false,
    })
  }

  revalidatePath('/tasks')
  revalidatePath('/my-tasks')
  revalidatePath('/my-dashboard')
  revalidatePath('/notifications')
  revalidatePath('/', 'layout')
}

export async function updateTaskData(id: string, data: any) {
  const { error } = await (supabaseClient as any)
    .from('tasks')
    .update({
      title: data.title,
      description: data.description,
      due_date: data.due_date,
      priority: data.priority,
      status: data.status,
      assignee_id: data.assignee_id,
      client_id: data.client_id
    })
    .eq('id', id)

  if (error) throw new Error('Failed to update task')
  revalidatePath('/tasks')
  revalidatePath('/my-tasks')
  revalidatePath('/')
}
