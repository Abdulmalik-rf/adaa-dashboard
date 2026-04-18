"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

export async function createContentItem(formData: FormData, platform: string) {
  const client_id = formData.get('client_id') as string
  const assignee_id = formData.get('assignee_id') as string
  const title = formData.get('title') as string
  const caption = formData.get('caption') as string
  const hashtags = formData.get('hashtags') as string
  const publish_date = formData.get('publish_date') as string
  const publish_time = formData.get('publish_time') as string
  const content_type = formData.get('content_type') as string

  // Combine caption and hashtags for final storage if needed, or keep separate if table supports it
  const finalCaption = `${caption}\n\n${hashtags}`

  const { data, error } = await (supabaseClient as any)
    .from('content_items')
    .insert({
      client_id,
      assignee_id,
      platform,
      title,
      caption: finalCaption,
      publish_date,
      publish_time,
      content_type: content_type || 'post',
      schedule_status: 'pending',
      task_status: 'not_started'
    })
    .select()

  if (error) {
    console.error('Error creating content item:', error)
    return
  }

  // Notify assignee
  if (assignee_id) {
    await (supabaseClient as any)
      .from('notifications')
      .insert({
        user_id: assignee_id,
        title: 'New Content Assignment',
        message: `You have been assigned to prepare: ${title} for ${platform}`,
        type: 'task_assigned',
        related_id: data[0].id,
        is_read: false
      })
  }

  revalidatePath('/scheduler')
  redirect('/scheduler')
}
