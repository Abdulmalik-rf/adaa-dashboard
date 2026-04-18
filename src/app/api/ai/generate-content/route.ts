import { NextRequest, NextResponse } from 'next/server'
import { openClawService } from '@/lib/openclaw/service'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { platform, topic, tone = 'professional', lang = 'en', audience, goal, offer, ctaDirection, customInstructions = '', existing } = body

    await new Promise(resolve => setTimeout(resolve, 800))

    const result = await openClawService.generateContent({
      platform, topic, tone, lang, audience, goal, offer, ctaDirection, existing,
      customInstructions,
    })

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: result.data })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: 'Failed to generate content' }, { status: 500 })
  }
}
