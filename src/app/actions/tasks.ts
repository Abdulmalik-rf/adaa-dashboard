"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

export async function markTaskCompleted(taskId: string, type: 'task' | 'content' = 'task', targetStatus: string = 'completed') {
  const table = type === 'content' ? 'content_items' : 'tasks'
  const statusField = type === 'content' ? 'task_status' : 'status'
  
  // 1. Update task to completed
  const { data, error } = await (supabaseClient as any)
    .from(table)
    .update({ 
      [statusField]: targetStatus,
      completed_at: targetStatus === 'completed' ? new Date().toISOString() : null
    })
    .eq('id', taskId)
    .select()

  if (error || !data || data.length === 0) {
    console.error(`Failed to update ${type}`, error)
    return
  }

  // 2. Create Notification for Admin
  if (targetStatus === 'completed') {
    const itemName = type === 'content' ? data[0].title : data[0].title
    await (supabaseClient as any)
      .from('notifications')
      .insert({
        user_id: null, // null means global/admin
        title: 'Task Completed',
        message: `Task/Content "${itemName}" has been marked as completed.`,
        type: 'task_completed',
        related_id: taskId,
        is_read: false
      })
  }

  revalidatePath('/my-tasks')
  revalidatePath('/scheduler')
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
    await (supabaseClient as any).from('notifications').insert({
      user_id: assignee_id,
      title: 'New Task Assigned',
      message: `You have been assigned: ${title}`,
      type: 'task_assigned',
      related_id: data[0].id
    })
  }

  revalidatePath('/tasks')
  revalidatePath('/my-tasks')
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
    // Notify assignee
    await (supabaseClient as any)
      .from('notifications')
      .insert({
        user_id: assignee_id,
        title: 'New Content Assigned',
        message: `You have been assigned to prepare: ${title}`,
        type: 'task_assigned',
        related_id: data[0].id,
        is_read: false
      })
  }

  revalidatePath('/scheduler')
}

export async function updateTaskAssignee(id: string, assignee_id: string) {
  const { error } = await (supabaseClient as any)
    .from('tasks')
    .update({ assignee_id })
    .eq('id', id)

  if (error) throw new Error('Failed')
  revalidatePath('/tasks')
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
