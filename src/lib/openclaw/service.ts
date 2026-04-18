export interface OpenClawConfig {
  endpoint: string
  apiKey?: string
  modelId?: string
  enabled: boolean
}

export type PermissionLevel = 'read_draft' | 'update_draft' | 'generate_content' | 'auto_fix' | 'trigger_automation'

export interface OpenClawAction {
  id: string
  name: string
  requiredPermissions: PermissionLevel[]
  requiresApproval: boolean
}

export interface ExecutionLog {
  id: string
  actionId: string
  timestamp: string
  status: 'success' | 'failed' | 'pending_approval'
  payload: any
  result?: any
}

const ACTION_REGISTRY: Record<string, OpenClawAction> = {
  'generate_content': {
    id: 'generate_content', name: 'Generate Content Suggestions',
    requiredPermissions: ['generate_content'], requiresApproval: false,
  },
  'auto_fix_warnings': {
    id: 'auto_fix_warnings', name: 'Auto-Fix Content Warnings',
    requiredPermissions: ['read_draft', 'update_draft', 'auto_fix'], requiresApproval: true,
  },
  'distribute_tasks': {
    id: 'distribute_tasks', name: 'Distribute Tasks',
    requiredPermissions: ['trigger_automation'], requiresApproval: true,
  }
}

// ─── Expert Content Fallback Engine ──────────────────────────────────────────
function buildExpertContent(payload: any): { title: string; hook: string; caption: string; hashtags: string; cta: string } {
  const platform  = payload.platform  || 'instagram'
  const topic     = payload.topic     || payload.brief || 'المحتوى الرقمي'
  const tone      = payload.tone      || 'professional'
  const lang      = payload.lang      || 'en'
  const audience  = payload.audience  || ''
  const goal      = payload.goal      || ''
  const offer     = payload.offer     || ''
  const ctaDir    = payload.ctaDirection || ''
  const isAr      = lang === 'ar' || topic.match(/[\u0600-\u06FF]/)
  const existing  = payload.existing  || {}
  const warnings  = existing.warnings || []
  const isFix     = tone.includes('corrected') || tone.includes('fix')
  const isViral   = tone.includes('viral') || tone.includes('high-energy')
  const isPremium = tone.includes('luxury') || tone.includes('premium')
  const isConvert = tone.includes('converting') || tone.includes('direct response')

  const audienceCtx = audience  ? (isAr ? `للجمهور المستهدف: ${audience}` : `for ${audience}`) : ''
  const goalCtx     = goal      ? (isAr ? `الهدف: ${goal}` : `goal: ${goal}`) : ''
  const offerCtx    = offer     ? (isAr ? `الميزة الحصرية: ${offer}` : `USP: ${offer}`) : ''

  // ── Fix Mode — address specific warnings ────────────────────────────────
  if (isFix && warnings.length > 0) {
    const issues = warnings.map((w: any) => isAr ? w.issueAr || w.issue : w.issue).join('، ')
    if (platform === 'tiktok') {
      return isAr ? {
        title:    `${topic} — الحل الكامل`,
        hook:     `توقف ثانية — هذا ما يغيّب عن ${topic} ويكلفك متابعيك`,
        caption:  `بعد تحليل عميق وجدنا ${warnings.length} مشاكل أساسية في هذا المحتوى.\n\nالإصلاح الكامل:\n${warnings.map((w: any, i: number) => `${i + 1}. ✅ ${w.fixAr || w.fix}`).join('\n')}\n\nطبّقنا التحسينات كاملة. النتيجة؟ محتوى أقوى وأداء أعلى.`,
        hashtags: '#fyp #foryoupage #تحسين_المحتوى #تسويق #viral #سوشيال_ميديا',
        cta:      ctaDir || 'علّق برأيك — هل تريد المزيد من هذه التحسينات؟ 👇',
      } : {
        title:    `${topic} — Complete Fix`,
        hook:     `Stop — here's what's killing your ${topic} performance`,
        caption:  `After deep analysis, we found ${warnings.length} critical issues with this content.\n\nFull fix applied:\n${warnings.map((w: any, i: number) => `${i + 1}. ✅ ${w.fix}`).join('\n')}\n\nAll improvements implemented. Result? Stronger content, higher performance.`,
        hashtags: '#fyp #foryoupage #contentfix #tiktokmarketing #viral #marketing',
        cta:      ctaDir || 'Comment your thoughts — want more optimizations like this? 👇',
      }
    }
  }

  // ── Platform-specific Expert Content ────────────────────────────────────
  if (platform === 'tiktok') {
    if (isAr) {
      if (isViral) return {
        title:    `${topic} 🔥`,
        hook:     `POV: اكتشفت الحقيقة الصادمة عن ${topic} وما أحد يتكلم عنها`,
        caption:  `الكل يعرف ${topic} — لكن لا أحد يعرف هذا.\n\nقضيت وقتاً طويلاً أبحث وأجرّب حتى وصلت لهذه النتيجة.\n\nالـ secret؟\n👉 ليس الأدوات — بل الطريقة الصحيحة في التفكير\n👉 الاتساق يتفوق دائماً على الإتقان\n👉 الجمهور يشعر بالأصالة فوراً\n\nلا تكرر الخطأ الذي وقع فيه الجميع في ${topic}. 💪${audienceCtx ? `\n\n${audienceCtx}` : ''}`,
        hashtags: '#fyp #foryoupage #viral #ترند #تيك_توك #محتوى_عربي',
        cta:      ctaDir || 'علّق "صح" إذا كنت تعاني من نفس الشيء 👇',
      }
      if (isPremium) return {
        title:    `${topic} — المستوى الراقي`,
        hook:     `${topic} بالطريقة التي يعرفها فقط من يفهم`,
        caption:  `هناك فرق واضح بين من يمارس ${topic} ومن يتقنه.\n\nالفرق ليس في الميزانية.\nوليس في أدوات التصميم.\n\nالفرق في:\n• الرؤية الاستراتيجية\n• الانتباه لأدق التفاصيل\n• المعرفة الحقيقية بما يريده الجمهور\n\nهذا ما نقدمه في كل مشروع.${offerCtx ? `\n\n${offerCtx}` : ''}`,
        hashtags: '#premium #راقي #تيك_توك #محتوى #سوشيال_ميديا #fyp',
        cta:      ctaDir || 'تواصل معنا لتجربة الفرق',
      }
      if (isConvert) return {
        title:    `${topic} — النتائج تتكلم`,
        hook:     `في 30 ثانية سأريك كيف ${topic} غيّر الحسابات من الصفر`,
        caption:  `قبل: صفر نتائج. صراع يومي. إنفاق بلا عائد.\n\nبعد تطبيق المنهجية الصحيحة في ${topic}:\n✅ نمو حقيقي وقابل للقياس\n✅ جمهور مستهدف ومتفاعل\n✅ عائد استثمار واضح\n\n${offerCtx || 'النتيجة الفارقة ليست حظاً — هي قرار.'}`,
        hashtags: '#fyp #viral #نتائج #نجاح #تسويق_رقمي #تيك_توك',
        cta:      ctaDir || 'أرسل "ابدأ" في DM وأرسلك الخطة كاملة مجاناً 📩',
      }
      return {
        title:    `${topic} — دليل متكامل`,
        hook:     `ما تعرفه عن ${topic} ناقص — وهذا يكلفك كثيراً`,
        caption:  `${topic} ليس مجرد أداة.\n\nهو استراتيجية متكاملة تحتاج:\n1️⃣ فهم عميق للجمهور\n2️⃣ محتوى مبني على بيانات حقيقية\n3️⃣ اتساق وصبر بمنهجية واضحة\n\nطبّق هذه الخطوات الثلاث وستلاحظ الفرق خلال أسبوعين.${goalCtx ? `\n\nالهدف: ${goalCtx}` : ''}`,
        hashtags: '#fyp #foryoupage #تعلم #تسويق #محتوى_عربي #سعودي',
        cta:      ctaDir || 'احفظ هذا الفيديو وطبّق النصائح الليلة 📌',
      }
    } else {
      if (isViral) return {
        title: `${topic} 🔥`,
        hook: `POV: You just discovered the shocking truth about ${topic} nobody talks about`,
        caption: `Everyone knows ${topic} — but nobody knows THIS.\n\nI spent months researching and testing until I got this result.\n\nThe secret?\n👉 It's not the tools — it's the right thinking\n👉 Consistency always beats perfection\n👉 Audiences feel authenticity instantly\n\nDon't make the mistake everyone makes with ${topic}. 💪`,
        hashtags: '#fyp #foryoupage #viral #trending #tiktok #contentcreator',
        cta: ctaDir || 'Comment "TRUE" if you\'ve been through this 👇',
      }
      if (isConvert) return {
        title: `${topic} — Results Speak`,
        hook: `In 30 seconds I'll show you how ${topic} changed accounts from zero`,
        caption: `Before: Zero results. Daily struggle. Spending with no return.\n\nAfter applying the right ${topic} methodology:\n✅ Real, measurable growth\n✅ Targeted, engaged audience\n✅ Clear ROI\n\n${offerCtx || 'The game-changing result isn\'t luck — it\'s a decision.'}`,
        hashtags: '#fyp #viral #results #success #digitalmarketing #tiktok',
        cta: ctaDir || 'DM "START" and I\'ll send you the full plan for free 📩',
      }
      return {
        title: `${topic} — Complete Guide`,
        hook: `What you know about ${topic} is incomplete — and it's costing you`,
        caption: `${topic} isn't just a tool.\n\nIt's a complete strategy that needs:\n1️⃣ Deep audience understanding\n2️⃣ Content built on real data\n3️⃣ Consistent, systematic approach\n\nApply these 3 steps and you'll notice the difference within 2 weeks.`,
        hashtags: '#fyp #foryoupage #learn #marketing #contentcreator #tiktok',
        cta: ctaDir || 'Save this video and apply the tips tonight 📌',
      }
    }
  }

  if (platform === 'instagram') {
    if (isAr) {
      if (isViral) return {
        title:    `${topic} — الكشف الكامل`,
        hook:     `الحقيقة عن ${topic} التي لا يريدك أحد أن تعرفها... 👇`,
        caption:  `قضيت وقتاً طويلاً وأنا أحاول أفهم لماذا ${topic} ينجح مع البعض ولا ينجح مع الآخرين.\n\nاكتشفت ثلاثة أسرار بسيطة يستقله المحترفون ولا يشاركونها:\n\n🔑 السر الأول: التركيز على الجودة لا الكمية\n🔑 السر الثاني: بناء هوية واضحة ومتسقة\n🔑 السر الثالث: التفاعل الحقيقي والأصيل مع الجمهور\n\nاحفظ هذا المنشور لأنك ستحتاجه لاحقاً. ❤️\n\n${audienceCtx ? audienceCtx + '\n' : ''}${goalCtx ? goalCtx : ''}`,
        hashtags: '#انستقرام #تسويق #محتوى #نمو #سوشيال_ميديا #ريلز #viral #fyp',
        cta:      ctaDir || 'احفظ المنشور وشارك مع شخص يحتاجه 🔁',
      }
      if (isPremium) return {
        title:    `${topic} — الفخامة التفصيل`,
        hook:     `حين يصبح ${topic} تجربة لا مجرد منتج... ✨`,
        caption:  `نؤمن أن ${topic} ليس مجرد خدمة — هو تجربة متكاملة تبدأ من اللحظة الأولى.\n\n كل تفصيل يُدرَس.\nكل قرار يُبنى على رؤية.\nكل خطوة تعكس قيمتنا للعميل.\n\nهذا ما يميّزنا.\nهذا ما نقدمه.\n${offerCtx ? '\n' + offerCtx : ''}`,
        hashtags: '#luxury #premium #راقي #تميز #حصري #انستقرام #reels',
        cta:      ctaDir || 'تواصل معنا لتجربة الفرق الحقيقي ⬆️',
      }
      return {
        title:    `${topic} — رؤية احترافية`,
        hook:     `3 أشياء أتمنى أن يخبرني بها أحد عن ${topic} قبل أن أبدأ`,
        caption:  `عندما بدأت في ${topic} لم أكن أعرف من أين أبدأ.\n\nبعد التجربة والخطأ والبحث المستمر، وصلت لإطار عمل واضح:\n\n📌 أولاً: ابنِ الأساس الصحيح — الهوية والاستراتيجية\n📌 ثانياً: افهم جمهورك أعمق من أي شيء آخر\n📌 ثالثاً: تحرك بثبات — الاتساق هو الميزة التنافسية الحقيقية\n\nما الذي تريد البدء به اليوم؟ أخبرني في التعليقات 👇\n${audienceCtx ? '\n' + audienceCtx : ''}`,
        hashtags: '#انستقرام #تسويق_رقمي #محتوى #نمو #ريلز #سوشيال_ميديا #اعمال',
        cta:      ctaDir || 'احفظ المنشور 📌 وشاركه مع شخص يبني حضوره الرقمي',
      }
    } else {
      if (isViral) return {
        title: `${topic} — Full Reveal`,
        hook: `The truth about ${topic} nobody wants you to know... 👇`,
        caption: `I spent a long time trying to understand why ${topic} works for some people and not others.\n\nI discovered 3 simple secrets professionals use but never share:\n\n🔑 Secret 1: Focus on quality, not quantity\n🔑 Secret 2: Build a clear, consistent identity\n🔑 Secret 3: Engage authentically with your audience\n\nSave this post because you'll need it later. ❤️`,
        hashtags: '#instagram #marketing #content #growth #socialmedia #reels #viral',
        cta: ctaDir || 'Save this post and share with someone who needs it 🔁',
      }
      if (isConvert) return {
        title: `${topic} — Real Results`,
        hook: `Here's proof that ${topic} actually works when done right`,
        caption: `Most people get ${topic} wrong because they skip the fundamentals.\n\nHere's the framework that actually converts:\n\n✅ Step 1: Know your audience better than they know themselves\n✅ Step 2: Lead with value, not promotion\n✅ Step 3: Make your CTA impossible to ignore\n\n${offerCtx || 'The difference between good and great is always in the details.'}`,
        hashtags: '#instagram #marketing #results #conversion #business #reels #growth',
        cta: ctaDir || 'Click the link in bio to get started today ⬆️',
      }
      return {
        title: `${topic} — Pro Perspective`,
        hook: `3 things I wish someone told me about ${topic} before I started`,
        caption: `When I started with ${topic}, I had no roadmap.\n\nAfter trial, error, and continuous research, I built a clear framework:\n\n📌 First: Build the right foundation — identity and strategy\n📌 Second: Understand your audience deeper than anything else\n📌 Third: Move with consistency — it's your real competitive advantage\n\nWhat do you want to start with today? Tell me in the comments 👇`,
        hashtags: '#instagram #digitalmarketing #content #growth #reels #socialmedia #business',
        cta: ctaDir || 'Save this post 📌 and share with someone building their digital presence',
      }
    }
  }

  if (platform === 'snapchat') {
    return isAr ? {
      title:    topic.slice(0, 20),
      hook:     `${topic} 🤯`,
      caption:  `${offer || topic} — الحقيقة كاملة في هذا السناب`,
      hashtags: '#سناب #سناب_شات #محتوى',
      cta:      ctaDir || 'اضغط للمزيد ⬆️',
    } : {
      title:    topic.slice(0, 20),
      hook:     `${topic} 🤯`,
      caption:  `${offer || topic} — the full truth in this snap`,
      hashtags: '#snap #snapchat #content',
      cta:      ctaDir || 'Tap for more ⬆️',
    }
  }

  // Google Ads
  return isAr ? {
    title:    offer ? `${offer} — احصل على عرضك` : `الحل الأمثل لـ ${topic}`,
    hook:     `${topic} — عرض محدود لا يتكرر`,
    caption:  `هل تبحث عن النتائج الحقيقية في ${topic}؟\n\nنقدم حلولاً مثبتة للسوق السعودي والخليجي:\n✅ ${offer || 'خبرة حقيقية وموثوقة'}\n✅ نتائج قابلة للقياس\n✅ دعم كامل وشامل\n\n${audienceCtx}`,
    hashtags: `${topic}, تسويق رقمي, سعودي, خليج`,
    cta:      ctaDir || 'احصل على استشارتك المجانية الآن — أماكن محدودة 🎯',
  } : {
    title:    offer ? `${offer} — Get Your Offer` : `Expert ${topic} Solutions`,
    hook:     `${topic} — Limited Time Offer`,
    caption:  `Looking for real results with ${topic}?\n\nWe deliver proven solutions for GCC markets:\n✅ ${offer || 'Real expertise and proven track record'}\n✅ Measurable results\n✅ Full support and consulting\n\n${audienceCtx}`,
    hashtags: `${topic}, digital marketing, saudi arabia, gulf`,
    cta:      ctaDir || 'Get your free consultation now — limited spots 🎯',
  }
}

// ─── Service Class ────────────────────────────────────────────────────────────
class OpenClawIntegrationLayer {
  private config: OpenClawConfig
  private grantedPermissions: Set<PermissionLevel>
  private auditLogs: ExecutionLog[]

  constructor() {
    this.config = {
      endpoint: process.env.OPENCLAW_ENDPOINT || 'http://localhost:18789',
      apiKey: process.env.OPENCLAW_API_KEY || '',
      modelId: process.env.OPENCLAW_MODEL_ID || 'default',
      enabled: true,
    }
    this.grantedPermissions = new Set(['read_draft', 'generate_content'])
    this.auditLogs = []
  }

  public grantPermission(perm: PermissionLevel)  { this.grantedPermissions.add(perm) }
  public revokePermission(perm: PermissionLevel) { this.grantedPermissions.delete(perm) }
  private hasPermissions(required: PermissionLevel[]): boolean { return required.every(p => this.grantedPermissions.has(p)) }

  private logExecution(actionId: string, status: 'success' | 'failed' | 'pending_approval', payload: any, result?: any) {
    const log: ExecutionLog = { id: Math.random().toString(36).substring(2), actionId, timestamp: new Date().toISOString(), status, payload, result }
    this.auditLogs.push(log)
    return log
  }

  private async executeAction<T>(actionId: string, payload: any, executionBlock: () => Promise<T>): Promise<{ success: boolean; data?: T; error?: string; requiresApproval?: boolean }> {
    if (!this.config.enabled) return { success: false, error: 'OpenClaw is disabled.' }
    const action = ACTION_REGISTRY[actionId]
    if (!action) return { success: false, error: 'Action not registered.' }
    if (!this.hasPermissions(action.requiredPermissions)) {
      this.logExecution(actionId, 'failed', payload, 'Permission Denied')
      return { success: false, error: 'Insufficient permissions.' }
    }
    if (action.requiresApproval) {
      this.logExecution(actionId, 'pending_approval', payload)
      return { success: true, requiresApproval: true, data: null as any }
    }
    try {
      const result = await executionBlock()
      this.logExecution(actionId, 'success', payload)
      return { success: true, data: result }
    } catch (err: any) {
      this.logExecution(actionId, 'failed', payload, err.message)
      return { success: false, error: err.message || 'Execution failed' }
    }
  }

  async generateContent(payload: any) {
    return this.executeAction('generate_content', payload, async () => {
      let rawResult: any = null

      // Try gateway first
      try {
        const existing    = payload.existing || {}
        const warningsList = (existing.warnings || []).map((w: any) => `- ${w.issue}: ${w.fix}`).join('\n')
        const prompt = `You are an elite social media strategist.
Platform: ${payload.platform}
Tone: ${payload.tone}
Topic/Brief: ${payload.topic}
Language: ${payload.lang || 'en'}
Audience: ${payload.audience || ''}
Goal: ${payload.goal || ''}
Offer/USP: ${payload.offer || ''}
CTA Direction: ${payload.ctaDirection || ''}
${existing.hook ? `Existing hook: ${existing.hook}` : ''}
${existing.caption ? `Existing caption: ${existing.caption}` : ''}
${warningsList ? `Issues to fix:\n${warningsList}` : ''}
Return ONLY valid JSON: {"title":"...","hook":"...","caption":"...","hashtags":"...","first_comment":"...","cta":"..."}`

        const response = await fetch(`${this.config.endpoint}/v1/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }) },
          body: JSON.stringify({ model: this.config.modelId, prompt }),
          signal: AbortSignal.timeout(6000),
        })
        if (response.ok) {
          const json = await response.json()
          const text = json.choices?.[0]?.text?.trim()
          if (text) {
            const match = text.match(/\{[\s\S]*\}/)
            if (match) rawResult = JSON.parse(match[0])
          }
        }
      } catch (_) {}

      // Expert fallback: generate based on payload
      if (!rawResult) rawResult = buildExpertContent(payload)

      // Auto Decision: Hashtags in caption or first comment
      const finalResult = { ...rawResult, first_comment: rawResult.first_comment || '' }

      if (payload.platform === 'instagram') {
        const captionLen = (finalResult.caption || '').length
        // If caption is long or tone is premium/viral, move hashtags to first comment to avoid clutter
        if (captionLen > 100 || payload.tone === 'premium' || payload.tone === 'viral') {
          if (!finalResult.first_comment && finalResult.hashtags) {
            finalResult.first_comment = finalResult.hashtags
            finalResult.hashtags = ''
          }
        }
      } else if (payload.platform === 'google_ads') {
        finalResult.first_comment = ''
        // In Google ads, hashtags act as keywords, let's keep them there but clear # symbols
        if (finalResult.hashtags) {
          finalResult.hashtags = finalResult.hashtags.replace(/#/g, '').replace(/,/g, ' | ')
        }
      } else if (payload.platform === 'snapchat') {
        finalResult.first_comment = ''
        // Snapchat best practice: minimal 1-3 hashtags, fast reading
        if (finalResult.hashtags) {
          finalResult.hashtags = finalResult.hashtags.split(' ').slice(0, 3).join(' ')
        }
      }

      return finalResult
    })
  }

  async distributeTasks(team: any[], tasks: any[]) {
    return this.executeAction('distribute_tasks', { teamCount: team.length, tasksCount: tasks.length }, async () => {
      return { status: 'mock_pending_approval' }
    })
  }

  async generateSmartReminders(clientContext: any) {
    return this.executeAction('distribute_tasks', clientContext, async () => {
      return [
        { title: 'Monthly Strategy Sync', type: 'meeting', days_from_now: 7, notes: "Discuss next month's content plan based on recent metrics." },
        { title: 'Service Satisfaction Check', type: 'call', days_from_now: 14, notes: 'Ensure client is happy with the latest deliverables.' },
        { title: 'Contract Renewal Preparation', type: 'task', days_from_now: 25, notes: 'Prepare the new proposal for next quarter.' }
      ]
    })
  }

  async analyzeWorkspace(payload: any) {
    return this.executeAction('generate_content', payload, async () => {
      return { status: 'implemented_via_other_methods' }
    })
  }

  async executeChat(messages: { role: string; content: string }[]) {
    return this.executeAction('generate_content', { isChat: true }, async () => {
      const chatPrompt = 'You are OpenClaw, the intelligent core of Agency OS. Reply in Arabic if the user writes in Arabic.\n' +
        messages.map(m => `${m.role === 'user' ? 'User' : 'OpenClaw'}: ${m.content}`).join('\n') + '\nOpenClaw:'
      const response = await fetch(`${this.config.endpoint}/v1/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(this.config.apiKey && { 'Authorization': `Bearer ${this.config.apiKey}` }) },
        body: JSON.stringify({ model: this.config.modelId, prompt: chatPrompt, max_tokens: 500 }),
        signal: AbortSignal.timeout(6000),
      })
      if (!response.ok) throw new Error(`Gateway unreachable: ${response.status}`)
      const json = await response.json()
      return json.choices[0].text.trim()
    })
  }
}

export const openClawService = new OpenClawIntegrationLayer()
