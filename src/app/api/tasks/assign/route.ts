import { NextRequest, NextResponse } from 'next/server'
import { updateTaskAssignee } from '@/app/actions/tasks'

export async function POST(req: NextRequest) {
  try {
    const { taskId, assigneeId } = await req.json()
    if (!taskId || !assigneeId) throw new Error('Missing payload')

    await updateTaskAssignee(taskId, assigneeId)
    return NextResponse.json({ success: true })
  } catch(e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 400 })
  }
}
