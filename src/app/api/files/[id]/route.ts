import { NextRequest, NextResponse } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { error } = await (supabaseClient as any)
    .from('client_files')
    .delete()
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ success: true })
}
