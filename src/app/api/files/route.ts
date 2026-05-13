import { NextRequest, NextResponse } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'

export async function POST(req: NextRequest) {
  try {
    const data = await req.json()
    const { data: result, error } = await (supabaseClient as any)
      .from('client_files')
      .insert({
        name: data.name,
        category: data.category,
        client_id: data.client_id,
        file_size: data.size ?? data.file_size,
        file_type: data.file_type,
        file_path: data.storage_path ?? data.file_path,
      })
      .select()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true, data: result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function GET() {
  const { data, error } = await (supabaseClient as any)
    .from('client_files')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
