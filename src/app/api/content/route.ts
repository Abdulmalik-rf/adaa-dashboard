import { NextRequest, NextResponse } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    
    const { data: result, error } = await (supabaseClient as any)
      .from('content_items')
      .insert({
        platform: data.platform,
        title: data.title,
        caption: data.caption,
        hashtags: data.hashtags,
        content_type: data.content_type,
        publish_date: data.publish_date,
        publish_time: data.publish_time,
        timezone: data.timezone || 'Asia/Riyadh',
        schedule_status: data.schedule_status || 'draft',
        task_status: data.task_status || 'not_started',
        client_id: data.client_id || null,
        assignee_id: data.assignee_id || null,
        media_url: data.media_url || null,
        thumbnail_url: data.thumbnail_url || null,
      })
      .select()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Create notification for assignee
    if (data.assignee_id && result && result.length > 0) {
      await (supabaseClient as any).from('notifications').insert({
        title: 'New Content Assigned',
        message: `You have been assigned to create: "${data.title}" on ${data.platform}`,
        type: 'task_assigned',
        related_id: result[0].id,
        user_id: data.assignee_id,
        is_read: false,
      })
    }

    return NextResponse.json({ success: true, data: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const platform = searchParams.get('platform')
  const clientId = searchParams.get('client_id')
  const status = searchParams.get('status')

  let query = (supabaseClient as any).from('content_items').select('*').order('publish_date', { ascending: true })

  if (platform && platform !== 'all') query = query.eq('platform', platform)
  if (clientId) query = query.eq('client_id', clientId)
  if (status) query = query.eq('schedule_status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
