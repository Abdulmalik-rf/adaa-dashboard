"use server"

import { supabaseClient } from "@/lib/supabase/client"
import { revalidatePath } from "next/cache"

const VALID_STATUSES = ['idea', 'pending', 'approved', 'scheduled', 'published'] as const

// Editorial workflow status update for content_items. Used by the
// content kanban board's column-move and the dropdown on each card.
export async function updateContentScheduleStatus(id: string, schedule_status: string) {
  if (!VALID_STATUSES.includes(schedule_status as any)) {
    throw new Error(`Invalid schedule_status: ${schedule_status}`)
  }
  const { error } = await (supabaseClient as any)
    .from('content_items')
    .update({ schedule_status })
    .eq('id', id)
  if (error) throw new Error(`Failed to update content status: ${error.message}`)

  revalidatePath('/content')
  revalidatePath('/calendar')
  revalidatePath('/')
}

export async function deleteContentItem(id: string) {
  const { error } = await (supabaseClient as any)
    .from('content_items')
    .delete()
    .eq('id', id)
  if (error) throw new Error(`Failed to delete content: ${error.message}`)

  revalidatePath('/content')
  revalidatePath('/calendar')
}
