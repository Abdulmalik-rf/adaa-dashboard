import { NextResponse } from 'next/server'
import { openClawService } from '@/lib/openclaw/service'
import type { SpecialistMode, DashboardContext } from '@/lib/openclaw/types'
import { resolveMode } from '@/lib/openclaw/types'

// ─── Expert System Prompt Builder ────────────────────────────────────────────
function buildSystemPrompt(ctx: DashboardContext, mode: SpecialistMode, lang: 'ar' | 'en'): string {
  const resolvedMode = resolveMode(ctx.currentPage || 'dashboard', mode)

  const PERSONA: Record<string, string> = {
    content_strategist: lang === 'ar'
      ? 'أنت OpenClaw — خبير استراتيجية المحتوى الرقمي من الطبقة الأولى. تعمل مع وكالات تسويق سعودية وخليجية كبرى. تُتقن بناء المحتوى الفيروسي، تحليل الجماهير، وتحويل المفاهيم إلى مقاطع وكابشنات تُحدث أثراً حقيقياً. أسلوبك دقيق، مباشر، واحترافي.'
      : 'You are OpenClaw, a Tier-1 digital content strategist with deep experience working with major GCC and Saudi agencies. You master viral content architecture, hooks, captions, scripts, and platform-specific optimization. Your output is sharp, specific, and immediately actionable.',
    viral_growth: lang === 'ar'
      ? 'أنت OpenClaw — خبير النمو الفيروسي على السوشيال ميديا. تفهم خوارزميات تيك توك وإنستقرام بعمق تقني حقيقي. تعرف آليات watch time، completion rate، sharing patterns، وكيف تجعل المحتوى يخترق الـ FYP. كلامك مبني على بيانات وليس حدساً.'
      : 'You are OpenClaw, a viral growth specialist with deep technical understanding of TikTok and Instagram algorithms. You understand watch time mechanics, completion rate optimization, and organic distribution patterns. Your advice is data-driven, not intuitive.',
    premium_brand: lang === 'ar'
      ? 'أنت OpenClaw — مستشار الهوية التجارية الراقية. تتخصص في بناء الصوت التجاري، الرسالة التسويقية، وتموضع العلامات التجارية الفخمة في الخليج العربي. تتقن الفرق بين \"Luxury\" و\"Premium\" و\"Aspirational\".'
      : 'You are OpenClaw, a premium brand identity consultant specializing in luxury and high-end brand voice for GCC markets. You master the nuance between Luxury, Premium, and Aspirational positioning.',
    conversion_expert: lang === 'ar'
      ? 'أنت OpenClaw — خبير التحويل وتحسين الإعلانات. تتقن Direct Response Copywriting، بناء صفحات الهبوط الفعّالة، وتحويل المشاهدة إلى مبيعات عبر Google Ads وMeta Ads.'
      : 'You are OpenClaw, a conversion optimization and paid media expert. You master Direct Response Copywriting, high-converting landing page strategy, and turning ad impressions into measurable revenue.',
    account_manager: lang === 'ar'
      ? 'أنت OpenClaw — مدير حسابات استراتيجي متمرس. تحلل العلاقات مع العملاء، تكتشف فرص النمو والـ Upsell، وتُبكر في رصد مخاطر الفقدان. أسلوبك مباشر وعملي.'
      : 'You are OpenClaw, a strategic account manager with deep CRM instincts. You detect churn signals early, identify upsell opportunities, and drive account growth through proactive relationship management.',
    operations_manager: lang === 'ar'
      ? 'أنت OpenClaw — مدير عمليات ميداني. تكتشف نقاط الاختناق في سير العمل، تعيد توزيع المهام بذكاء، وتضمن أن الفريق يعمل بكامل طاقته دون ضغط زائد.'
      : 'You are OpenClaw, a field operations manager. You identify workflow bottlenecks, intelligently redistribute workloads, and ensure team efficiency without burnout.',
    financial_analyst: lang === 'ar'
      ? 'أنت OpenClaw — محلل مالي وأعمال متخصص في قطاع التسويق والوكالات. تفهم هوامش الربح، LTV، التدفق النقدي، وكيف تحول الأرقام إلى قرارات استراتيجية.'
      : 'You are OpenClaw, a financial and business analyst specializing in marketing agencies. You translate revenue patterns, margin data, and cash flow into strategic business decisions.',
    auto: lang === 'ar'
      ? 'أنت OpenClaw — نظام الذكاء الاصطناعي المتكامل للوكالة. تتقن المحتوى، العمليات، إدارة العملاء، التحليل المالي، والاستراتيجية الشاملة.'
      : 'You are OpenClaw, the elite AI operator of this agency dashboard. You are expert across content, operations, client management, financial analysis, and business strategy.',
  }

  const contextBlock = [
    `Current dashboard page: ${ctx.currentPage || 'dashboard'}`,
    ctx.platform ? `Active platform: ${ctx.platform}` : '',
    ctx.clientName ? `Selected client: ${ctx.clientName}` : '',
    ctx.contentDraft?.hook ? `Current content hook: "${ctx.contentDraft.hook}"` : '',
    ctx.contentDraft?.caption ? `Current caption: "${ctx.contentDraft.caption.slice(0, 150)}..."` : '',
    ctx.contentDraft?.hashtags ? `Current hashtags: ${ctx.contentDraft.hashtags}` : '',
    ctx.taskStats ? `Task overview — overdue: ${ctx.taskStats.overdue}, pending: ${ctx.taskStats.pending}, total: ${ctx.taskStats.total}` : '',
  ].filter(Boolean).join('\n')

  const rules = lang === 'ar' ? `
━━━━━━━━ قواعد الاستجابة الذهبية لـ OpenClaw ━━━━━━━━

أنت خبير حقيقي، وليس مساعداً عاماً. كل رد يجب أن يكون:
✓ متخصصاً في السياق الحالي (المنصة / العميل / المحتوى)
✓ مكتوباً بعربية سلسة واحترافية مناسبة للسوق الخليجي والسعودي
✓ مباشراً وعملياً — لا حشو، لا تعميمات فارغة
✓ يعكس خبرة حقيقية، وليس معلومات نظرية عامة

ثلاثة مستويات للذكاء يجب أن تُظهرها:
1) تحليل السياق: اقرأ المعطيات وافهم ما يريده المستخدم فعلاً
2) الإجابة الخبيرة: قدّم رأيك كخبير، مع شرح سريع للسبب
3) الخطوة القابلة للتنفيذ: اختم بخطوة واحدة واضحة يمكن تنفيذها الآن

للمحتوى العربي — قواعد الجودة:
• لا تترجم حرفياً من الإنجليزية — اكتب بطريقة يستخدمها المحترف العربي الأصلي
• استخدم إيقاع الجملة الخليجي/السعودي في الكابشنات والهوكات
• الهوك العربي القوي: جريء، يُحدث إزعاجاً إيجابياً، أو يستفز تساؤلاً حقيقياً
• تجنب العبارات الجاهزة: "في هذا الفيديو سأوضح..."، "اليوم سنتعلم..."، "مرحباً بكم..."

للمحتوى القابل للتطبيق في المحرر:
إذا طُلب منك توليد هوك أو كابشن، ضعه في بلوك JSON:
\`\`\`json
{
  "hook": "...",
  "caption": "...",
  "hashtags": "...",
  "cta": "..."
}
\`\`\`

` : `
━━━━━━━━ OpenClaw Golden Response Rules ━━━━━━━━

You are a real expert, not a generic assistant. Every response must be:
✓ Specific to the current context (platform / client / content)
✓ Written in sharp, professional English/Arabic matching the GCC market
✓ Direct and actionable — no filler, no empty generalizations
✓ Reflecting real expertise, not generic informational content

Three intelligence levels to demonstrate:
1) Context Analysis: Read the signals and understand what the user actually needs
2) Expert Answer: Give your opinion as a specialist with a brief "why"
3) Executable Next Step: End with one clear action they can take right now

For content generation requests:
Always include a JSON block for direct editor injection:
\`\`\`json
{
  "hook": "...",
  "caption": "...",
  "hashtags": "...",
  "cta": "..."
}
\`\`\`
`

  return `${PERSONA[resolvedMode] || PERSONA['auto']}

Active specialist mode: ${resolvedMode.replace('_', ' ').toUpperCase()}
Dashboard Language: ${lang === 'ar' ? 'Arabic (Arabic-first mode)' : 'English'}

Dashboard Context:
${contextBlock || 'General dashboard view'}
${rules}`
}

// ─── Expert Fallback Intelligence Engine ─────────────────────────────────────
function buildFallbackReply(
  messages: { role: string; content: string }[],
  ctx: DashboardContext,
  mode: SpecialistMode,
  lang: 'ar' | 'en'
): string {
  const last     = messages[messages.length - 1]?.content || ''
  const lastL    = last.toLowerCase()
  const resolved = resolveMode(ctx.currentPage || '', mode)

  const platform   = ctx.platform || ''
  const clientName = ctx.clientName || ''
  const draft      = ctx.contentDraft || {}
  const taskStats  = ctx.taskStats
  const page       = ctx.currentPage || ''

  const pick = (ar: string, en: string) => lang === 'ar' ? ar : en

  // ── Intent Detection ──────────────────────────────────────────────────────
  const isGreeting    = /^(hi|hello|hey|مرحب|اهلا|هلا|سلام|صباح|مساء|كيف)/.test(lastL.trim())
  const aboutHook     = /hook|هوك|جملة افتتاح|افتتاحية|opening/.test(lastL)
  const aboutHashtag  = /hashtag|هاشتاق|وسم|تاق/.test(lastL)
  const aboutViral    = /viral|فيروسي|انتشار|reach|ريتش/.test(lastL)
  const aboutIdeas    = /idea|فكرة|أفكار|content idea|ماذا أنشر|اقتراح محتوى/.test(lastL)
  const aboutTrend    = /trend|ترند|رائج|مشهور|trending/.test(lastL)
  const aboutClip     = /clip|فيديو|مقطع|style|أسلوب تصوير|format|شكل الفيديو/.test(lastL)
  const aboutScript   = /script|سكريبت|نص|سيناريو|كلام الفيديو/.test(lastL)
  const aboutCaption  = /caption|كابشن|وصف|نص المنشور/.test(lastL)
  const aboutScore    = /score|نقاط|تقييم|audit|مراجعة/.test(lastL)
  const aboutTask     = /task|مهمة|مهام|assign|توزيع|overdue|متأخر/.test(lastL)
  const aboutClient   = /client|عميل|حساب|عملاء/.test(lastL)
  const aboutStrategy = /strategy|استراتيج|plan|خطة/.test(lastL)
  const aboutFix      = /fix|اصلح|improve|تحسين|correct|ضعيف|weak/.test(lastL)
  const aboutSchedule = /schedul|جدول|وقت النشر|متى|publish|post time/.test(lastL)
  const aboutConvert  = /convert|تحويل|sale|مبيع|lead|cta/.test(lastL)
  const aboutFinance  = /revenue|ربح|profit|invoice|مالي|فاتور/.test(lastL)

  // ── GREETING ──────────────────────────────────────────────────────────────
  if (isGreeting) {
    const expertAr: Record<string, string> = {
      content_strategist: 'خبير استراتيجية المحتوى',
      viral_growth: 'خبير النمو الفيروسي',
      premium_brand: 'مستشار الهوية الراقية',
      conversion_expert: 'خبير التحويل والمبيعات',
      account_manager: 'مدير حساباتك الاستراتيجي',
      operations_manager: 'مدير العمليات الميداني',
      financial_analyst: 'محللك المالي',
      auto: 'نظام الذكاء الاصطناعي للوكالة',
    }
    const platformCtx = platform ? pick(` أرى أنك على منصة **${platform.toUpperCase()}**.`, ` I can see you're on **${platform.toUpperCase()}**.`) : ''
    const clientCtx   = clientName ? pick(` العميل الحالي: **${clientName}**.`, ` Current client: **${clientName}**.`) : ''
    const taskCtx     = taskStats?.overdue ? pick(` ⚠️ لديك **${taskStats.overdue}** مهمة متأخرة.`, ` ⚠️ You have **${taskStats.overdue}** overdue tasks.`) : ''
    return pick(
      `أهلاً 👋 أنا OpenClaw — ${expertAr[resolved] || expertAr['auto']}.${platformCtx}${clientCtx}${taskCtx}\n\n**أوامر سريعة يمكنك إعطائها:**\n• \"اقترح لي 3 أفكار محتوى لهذا الأسبوع\"\n• \"اكتب هوك قوي لمنشوري الجاي\"\n• \"ما أفضل أسلوب تصوير لهذا الموضوع؟\"\n• \"ما الترند الحالي المناسب لعميلي؟\"\n• \"راجع كابشني وحسّنه\"\n\nما الذي تريد البدء به؟`,
      `Hey 👋 I'm OpenClaw — ${expertAr[resolved] || 'your AI Operations Expert'}.\n${platformCtx}${clientCtx}${taskCtx}\n\n**Quick commands:**\n• "Suggest 3 content ideas for this week"\n• "Write a strong hook for my next post"\n• "What's the best clip style for this topic?"\n• "What trend fits my client right now?"\n• "Review and improve my caption"\n\nWhat would you like to start with?`
    )
  }

  // ── CONTENT IDEAS ─────────────────────────────────────────────────────────
  if (aboutIdeas) {
    const ideasByPlatform: Record<string, { ar: string; en: string }> = {
      tiktok: {
        ar: `**أفكار محتوى تيك توك — ${clientName || 'الحساب الحالي'}:**\n\n1. 🔥 **سلسلة "ما لا يخبرك به أحد"** — اكشف حقيقة خفية في مجالك في أقل من 30 ثانية\n2. ⚡ **"POV: أنت في..." ** — ضع الجمهور في مكانك مباشرة\n3. 📊 **مقارنة صادمة** — قبل/بعد، غلط/صح، رخيص/باهظ\n4. 🎯 **الخطأ الذي يكرره الجميع** — نقطة ألم مباشرة + حل فوري\n5. 💡 **"في 60 ثانية يمكنك..."** — محتوى تعليمي سريع الاستهلاك\n\n**الأفضل أداءً هذا الشهر على تيك توك:**\n• فيديوهات "حياة يوم واحد" في المجال\n• Behind-the-scenes حقيقي بدون إخراج مصطنع\n• ردود على تعليقات الجمهور`,
        en: `**TikTok Content Ideas — ${clientName || 'Current Account'}:**\n\n1. 🔥 **"What nobody tells you about [topic]"** — reveal a hidden truth in under 30 seconds\n2. ⚡ **POV format** — put the viewer directly in your shoes\n3. 📊 **Shocking comparison** — before/after, right/wrong, cheap/expensive\n4. 🎯 **"The mistake everyone makes"** — direct pain point + instant solution\n5. 💡 **"In 60 seconds you can..."** — fast educational content\n\n**Best-performing right now on TikTok:**\n• "Day in the life" in your niche\n• Raw, unscripted behind-the-scenes\n• Responding to audience comments`,
      },
      instagram: {
        ar: `**أفكار محتوى إنستقرام — ${clientName || 'الحساب الحالي'}:**\n\n1. 📱 **Carousel "دليل كامل"** — 7-10 شرائح تعليمية قابلة للحفظ\n2. 🎬 **Reel "هل تعرف أن..."** — معلومة صادمة بإيقاع سريع\n3. 💬 **"سؤال الأسبوع"** — يُحفز التعليق ويُضخم الوصول\n4. 🌟 **Story poll** — رأي جمهورك + نتيجة تشاركها\n5. 📸 **Behind the brand** — صور أصيلة من خلف الكواليس\n\n**أعلى save rate:**\n• Carousel مع tips يحتاجها الجمهور لاحقاً\n• قوائم من 5-10 نقاط`,
        en: `**Instagram Content Ideas — ${clientName || 'Current Account'}:**\n\n1. 📱 **"Complete guide" Carousel** — 7-10 educational slides built to be saved\n2. 🎬 **"Did you know..." Reel** — shocking insight with fast pacing\n3. 💬 **"Question of the week"** — drives comments, amplifies reach\n4. 🌟 **Story poll** — collect audience opinion + share results\n5. 📸 **Behind the brand** — authentic behind-the-scenes shots\n\n**Highest save rate:**\n• Carousel with actionable tips\n• Lists of 5-10 points`,
      },
    }
    const fallback = {
      ar: `**أفكار محتوى — ${clientName || 'الأسبوع الحالي'}:**\n\n1. "الحقيقة عن [الموضوع]..." — يصدم، يُثير فضول\n2. سلسلة أسبوعية بمحور ثابت — تبني التوقع لدى الجمهور\n3. قصة نجاح عميل حقيقي — أقوى من أي إعلان\n4. مقارنة قبل/بعد بصرية — مباشرة وفعّالة\n5. "ماذا كنت أتمنى أن أعرف عن [مجال] قبل 3 سنوات"`,
      en: `**Content Ideas — ${clientName || 'This Week'}:**\n\n1. "The truth about [topic]..." — shocks, creates curiosity\n2. Weekly series with a consistent theme — builds audience expectation\n3. Real client success story — more powerful than any ad\n4. Visual before/after comparison — direct and effective\n5. "What I wish I knew about [industry] 3 years ago"`,
    }
    const ideas = ideasByPlatform[platform] || fallback
    return lang === 'ar' ? ideas.ar : ideas.en
  }

  // ── TRENDS ────────────────────────────────────────────────────────────────
  if (aboutTrend) {
    return pick(
      `**الترندات الجديرة بالاهتمام — ${platform?.toUpperCase() || 'عام'}:**\n\n🔥 **أسلوب "Honest Review"** — مراجعات صريحة بدون مجاملة. الأداء عالٍ لأنه ينسجم مع نبض الجمهور الذي شبع من المحتوى الإعلاني الجاهز.\n\n📈 **"Reaction Content"** — محتوى رد الفعل على أخبار أو مستجدات المجال. سريع التنفيذ وعالي التفاعل.\n\n💬 **"Text-on-screen storytelling"** — قصة تُروى بنص على الشاشة بدون صوت. يستهلكها المستخدمون بصمت في الأماكن العامة.\n\n🎯 **"Empty promise calling-out"** — المحتوى الذي يكشف ادعاءات كاذبة في المجال. يُبني ثقة ومصداقية.\n\n**كيف تستغله لـ ${clientName || 'عميلك'}:**\nاختر الترند الأقرب لصوت العلامة التجارية واستخدمه كـ wrapper لرسالة قيمة أصيلة. لا تقلّد — أضف زاوية مختلفة.`,
      `**Trends Worth Adapting — ${platform?.toUpperCase() || 'General'}:**\n\n🔥 **"Honest Review" format** — Unfiltered, direct reviews. High performance because audiences are fatigued by polished ad content.\n\n📈 **"Reaction content"** — Reacting to industry news or events. Fast to execute, high engagement ceiling.\n\n💬 **"Text-on-screen storytelling"** — Story told via on-screen text without voiceover. Consumed silently in public spaces.\n\n🎯 **"Empty promise calling-out"** — Content that exposes false claims in your industry. Builds trust and authority fast.\n\n**How to use it for ${clientName || 'your client'}:**\nChoose the trend closest to the brand's voice and use it as a wrapper for a genuinely valuable message. Don't copy — add a unique angle.`
    )
  }

  // ── CLIP STYLE ────────────────────────────────────────────────────────────
  if (aboutClip) {
    const clipsByPlatform: Record<string, { ar: string; en: string }> = {
      tiktok: {
        ar: `**أسلوب الكليب الأمثل لتيك توك:**\n\n🎬 **تحدث مباشرة للكاميرا** — الأقوى تأثيراً. اجعل النظرة في العين هي الهوك البصري.\n\n✂️ **Jump cuts كل 2-3 ثوان** — لا تدع المشاهد يشعر بالثقل. الإيقاع السريع = completion rate أعلى.\n\n🎙️ **لا موسيقى خلفية** — في العربي التحدثي، الصوت هو التجربة الكاملة. الموسيقى تُشتت.\n\n📍 **Hook البصري في أول 0.5 ثانية** — حركة، كلمة كبيرة على الشاشة، أو تعبير وجه.\n\n**الصيغة المُوصى بها للموضوع الحالي:**\nTalking Head + Text overlay + سرعة تحرير متوسطة + CTA بصري في النهاية.`,
        en: `**Optimal Clip Style for TikTok:**\n\n🎬 **Direct-to-camera talking head** — strongest impact. Eye contact IS the hook.\n\n✂️ **Jump cuts every 2-3 seconds** — never let the viewer feel weight. Fast pacing = higher completion rate.\n\n🎙️ **No background music** — for dialogue-driven content, voice IS the experience.\n\n📍 **Visual hook in the first 0.5 seconds** — movement, large on-screen text, or facial expression.\n\n**Recommended format for this topic:**\nTalking Head + Text overlay + medium edit speed + visual CTA at the end.`,
      },
      instagram: {
        ar: `**أسلوب الكليب الأمثل للإنستقرام:**\n\n🎨 **جماليات اللون متسقة** — هوية بصرية واحدة في كل الريلز.\n\n🕐 **7-15 ثانية** للوصول إلى أعلى completion rate. فوق 30 ثانية: احتاج re-hook في المنتصف.\n\n🎵 **صوت ترند أو موسيقى عاطفية** — يضاعف الـ discovery.\n\n📐 **إيقاع سردي: مشكلة → لحظة تحول → حل** — حتى في 15 ثانية.\n\n**الصيغة الأعلى أداءً:**\nB-roll جمالي + voiceover + text overlay + موسيقى ناعمة.`,
        en: `**Optimal Clip Style for Instagram:**\n\n🎨 **Consistent visual aesthetic** — one color identity across all Reels.\n\n🕐 **7-15 seconds** for peak completion rate. Over 30 seconds? Add a mid-video re-hook.\n\n🎵 **Trending audio or emotional music** — multiplies discovery reach.\n\n📐 **Narrative arc: Problem → Turning point → Solution** — even in 15 seconds.\n\n**Best-performing format:**\nAesthetic B-roll + voiceover + text overlay + soft music.`,
      },
    }
    const res = clipsByPlatform[platform] || { ar: 'أخبرني بالمنصة والموضوع لأعطيك توصية أسلوب الكليب الأدق.', en: 'Tell me the platform and topic for a precise clip style recommendation.' }
    return lang === 'ar' ? res.ar : res.en
  }

  // ── HOOK ──────────────────────────────────────────────────────────────────
  if (aboutHook) {
    const currentHook = draft.hook || ''
    const platformTipAr: Record<string, string> = {
      tiktok: 'تيك توك: الهوك يجب أن يصدم أو يستفز في أول ثانية واحدة. اجعل الجملة الأولى تجعله يفكر "انتظر، ماذا؟"',
      instagram: 'إنستقرام: افتح بجملة تجبره على الضغط "المزيد". الوعد الجريء أو السؤال غير المتوقع.',
      snapchat: 'سناب: 3 كلمات على الشاشة. الصورة تتحدث + نص صاعق.',
      google_ads: 'جوجل أدز: الهوك هو العنوان — ضع الكلمة المفتاحية + فائدة واحدة واضحة.',
    }
    const currentBlock = currentHook
      ? pick(`\n\n📝 **الهوك الحالي:** "${currentHook.slice(0, 100)}"\n\n💡 **مقترحات أقوى:**\n1. "${currentHook.split(' ').slice(0, 3).join(' ')}... لكن الحقيقة مختلفة تماماً"\n2. "توقف — هذا سيغير طريقة تفكيرك في [الموضوع]"\n3. "الخطأ الذي يرتكبه 9 من أصل 10 في [المجال]"`,
              `\n\n📝 **Current hook:** "${currentHook.slice(0, 100)}"\n\n💡 **Stronger alternatives:**\n1. "Stop — this will change how you think about [topic]"\n2. "The mistake 9 out of 10 people make in [field]"\n3. "Nobody talks about this, but [bold claim]"`)
      : ''
    return pick(
      `**تحليل الهوك — ${platform?.toUpperCase() || 'عام'}**\n\n${platformTipAr[platform] || 'الهوك الناجح: يُحدث ارتباكاً إيجابياً، أو يطعن في معتقد شائع، أو يعد بفائدة فورية واضحة.'}${currentBlock}\n\n**الصيغ الذهبية:**\n• **كسر النمط:** "كل ما تعلمته عن [X] كان خطأ"\n• **وعد الفائدة:** "في 30 ثانية ستعرف [فائدة مباشرة]"\n• **نقطة الألم:** "لماذا لا تصل إلى [هدف] رغم كل شيء؟"\n• **الادعاء الجريء:** "هذه التقنية ضاعفت نتائجنا 3x"\n• **استفزاز السؤال:** "هل تعلم أن معظم [الجمهور] لا يعرف [حقيقة]؟"\n\nأعطني موضوع المحتوى وسأكتب لك 5 هوكات جاهزة.`,
      `**Hook Analysis — ${platform?.toUpperCase() || 'General'}**\n\n${`On ${platform || 'any platform'}, the hook must create a "wait, what?" moment in the first 1-2 seconds.`}${currentBlock}\n\n**Golden formulas:**\n• **Pattern interrupt:** "Everything you know about [X] is wrong"\n• **Benefit promise:** "In 30 seconds you'll know [direct benefit]"\n• **Pain point:** "Why you're not getting [result] despite everything?"\n• **Bold claim:** "This technique 3x'd our results"\n• **Provocative question:** "Do you know most [audience] don't know [truth]?"\n\nGive me the topic and I'll write 5 ready-to-use hooks.`
    )
  }

  // ── CAPTION ───────────────────────────────────────────────────────────────
  if (aboutCaption) {
    const currentCaption = draft.caption || ''
    return pick(
      `**تحسين الكابشن — ${platform?.toUpperCase() || 'عام'}:**\n\n${currentCaption ? `📝 **كابشنك الحالي (أول 100 حرف):** "${currentCaption.slice(0, 100)}..."\n\n` : ''}**قواعد الكابشن القوي:**\n• **السطر الأول** = الهوك — يظهر قبل الضغط "المزيد"\n• **الجسم** = قيمة حقيقية، محادثة أو قصة أو بيانات\n• **النهاية** = سؤال أو CTA يستفز التعليق\n\n**أخطاء يجب تجنبها:**\n❌ البداية بـ "في هذا البوست"\n❌ الإطالة بدون قيمة\n❌ CTA مدفونة في الوسط\n❌ ختام بارد بدون call-to-action\n\nأرسل لي الكابشن الحالي وسأعيد كتابته بشكل احترافي.`,
      `**Caption Upgrade — ${platform?.toUpperCase() || 'General'}:**\n\n${currentCaption ? `📝 **Your current caption (first 100 chars):** "${currentCaption.slice(0, 100)}..."\n\n` : ''}**Rules for a strong caption:**\n• **First line** = the hook — shows before "more" is tapped\n• **Body** = real value: conversation, story, or data\n• **End** = question or CTA that baits comments\n\n**Mistakes to avoid:**\n❌ Starting with "In this post"\n❌ Long without value\n❌ CTA buried in the middle\n❌ Cold ending without call-to-action\n\nSend me the current caption and I'll rewrite it professionally.`
    )
  }

  // ── SCRIPT ────────────────────────────────────────────────────────────────
  if (aboutScript) {
    return pick(
      `**بنية السكريبت الاحترافية — ${platform?.toUpperCase() || 'عام'}:**\n\n**الهيكل الذهبي (15-60 ثانية):**\n\n⚡ **[0-2 ثانية] الهوك البصري والصوتي:**\nجملة واحدة تصدم أو تستفز فوراً.\n\n📖 **[2-10 ثانية] بناء السياق:**\nلماذا يجب أن يستمر في المشاهدة؟ ما الذي سيكسبه؟\n\n💡 **[10-40 ثانية] القيمة الأساسية:**\nالمعلومة، القصة، الكشف. لا تطل. كل جملة لها غرض.\n\n🎯 **[40-55 ثانية] Re-hook (للفيديوهات الطويلة):**\nابدأ نقطة جديدة مثيرة لإبقاء المشاهد.\n\n✅ **[الثواني الأخيرة] CTA:**\nواضح، محدد، فوري. "تعليق"، "حفظ"، "مشاركة"، أو "رابط البايو".\n\nأعطني الموضوع وسأكتب لك نص السكريبت الكامل.`,
      `**Professional Script Structure — ${platform?.toUpperCase() || 'General'}:**\n\n**The Golden Framework (15-60 seconds):**\n\n⚡ **[0-2 sec] Visual and audio hook:**\nOne sentence that shocks or provokes immediately.\n\n📖 **[2-10 sec] Context building:**\nWhy should they keep watching? What will they gain?\n\n💡 **[10-40 sec] Core value:**\nThe information, story, or reveal. Stay tight. Every sentence has a purpose.\n\n🎯 **[40-55 sec] Re-hook (for longer videos):**\nIntroduce a new compelling point to retain the viewer.\n\n✅ **[Last seconds] CTA:**\nClear, specific, immediate. "Comment," "Save," "Share," or "Link in bio."\n\nGive me the topic and I'll write the full script.`
    )
  }

  // ── TASKS ────────────────────────────────────────────────────────────────
  if (aboutTask || resolved === 'operations_manager') {
    const overdueWarning = taskStats?.overdue
      ? pick(`\n\n🚨 **تحذير عاجل:** ${taskStats.overdue} مهمة متأخرة تحتاج تدخلاً فورياً.`, `\n\n🚨 **Critical:** ${taskStats.overdue} overdue tasks require immediate action.`)
      : ''
    return pick(
      `**رؤية مدير العمليات**${overdueWarning}\n\n**خطة العمل الفورية:**\n1. أوقف كل شيء — أنهِ المتأخرات أولاً أو أعد جدولتها مع إخطار العميل\n2. تأكد أن لكل مهمة مفتوحة مسؤول واضح وتاريخ استحقاق\n3. أي مهمة في "مراجعة" أكثر من 48 ساعة — على الأرجح محجوبة\n4. المهام الأقل من يوم — وزّعها للأشخاص الأقل حملاً\n\n**نمط يجب تجنبه:**\nلا تبدأ مهام جديدة طالما المتأخرات لم تُعالج.`,
      `**Operations Manager View**${overdueWarning}\n\n**Immediate action plan:**\n1. Stop everything — clear or reschedule overdue tasks first, notify clients\n2. Ensure every open task has a clear owner and due date\n3. Anything "In Review" for 48+ hours is likely blocked — investigate\n4. Tasks under one day — distribute to least-loaded team members\n\n**Pattern to avoid:**\nNever start new tasks while the backlog of overdue items isn't resolved.`
    )
  }

  // ── CLIENTS ──────────────────────────────────────────────────────────────
  if (aboutClient || resolved === 'account_manager') {
    return pick(
      `**رؤية مدير الحسابات — ${clientName ? clientName : 'محفظة العملاء'}**\n\n**إشارات الخطر التي أراقبها:**\n🔴 عميل بدون تواصل 30+ يوماً — خطر مغادرة مرتفع\n🟠 عقد قريب من انتهائه — ابدأ محادثة التجديد الآن\n🟡 حساب يدفع بدون مهام نشطة — خطر التدهور الصامت\n🟢 عميل راضٍ + تفاعل عالٍ — فرصة Upsell ذهبية\n\n**الخطوة الأذكى الآن:**\nتواصل مع أهدأ عميل لديك — الصمت في العلاقات التجارية دائماً يعني شيئاً.`,
      `**Account Manager View — ${clientName || 'Client Portfolio'}**\n\n**Risk signals I watch:**\n🔴 No contact in 30+ days — high churn risk\n🟠 Contract expiring — start renewal conversation now\n🟡 Paying account with no active tasks — silent drift risk\n🟢 Satisfied + engaged client — prime upsell opportunity\n\n**Smartest move now:**\nreach out to your quietest client — silence in business relationships always means something.`
    )
  }

  // ── SCHEDULING ───────────────────────────────────────────────────────────
  if (aboutSchedule) {
    const timesAr: Record<string, string> = {
      tiktok: '**أوقات الذروة:** 7-9 مساءً (الأعلى) • 12-1 ظهراً • 11 مساءً. الفيديوهات العربية أعلى أداءً في الجمعة-السبت صباحاً.',
      instagram: '**أوقات الذروة:** 9 صباحاً • 12 ظهراً • 5-7 مساءً. الثلاثاء والخميس أعلى تفاعلاً في الخليج.',
      snapchat: '**أوقات الذروة:** 8-10 صباحاً و 8-11 مساءً. المستخدمون الأصغر سناً أكثر نشاطاً بعد المدرسة.',
      google_ads: '**أوقت الإعلانات:** الثلاثاء-الخميس 9ص-5م للـ B2B. المساء للاستهلاكي.',
    }
    return pick(
      `${timesAr[platform] || 'انشر حين يكون جمهورك الفعلي أكثر نشاطاً — راجع Analytics الحساب للحصول على بيانات دقيقة.'}\n\n**قاعدة الاتساق:**\nالوقت الثابت للنشر يُعوّد الخوارزمية ويبني توقع الجمهور. أهم من الوقت المثالي المتغير.`,
      `${`On ${platform || 'any platform'}: Check your account Analytics for actual audience peak times. Generic best times are starting points, not rules.`}\n\n**Consistency rule:**\nRegular posting times train the algorithm and build audience expectation — more valuable than chasing the "perfect" time.`
    )
  }

  // ── FINANCE ──────────────────────────────────────────────────────────────
  if (aboutFinance || resolved === 'financial_analyst') {
    return pick(
      `**رؤية المحلل المالي — الوكالة:**\n\n**ثلاثة مؤشرات لا يجب تجاهلها:**\n\n💰 **هامش الربح لكل عميل** — لا كل العملاء في نفس المستوى. من يخسر وقتك؟\n📅 **العقود القريبة من الانتهاء** — كل عقد لم تحدثه = إيراد ضائع\n⚠️ **الفواتير المتأخرة** — اكشفها الآن قبل نهاية الشهر\n\n**توصية فورية:**\nرتّب عملاءك حسب الهامش لا حسب الإيراد — وستكتشف من يستحق وقتك فعلاً.`,
      `**Financial Analyst View — Agency:**\n\n**Three metrics never to ignore:**\n\n💰 **Profit margin per client** — not all clients are equal. Who's consuming time without ROI?\n📅 **Contracts nearing expiry** — every un-renewed contract = lost revenue\n⚠️ **Overdue invoices** — surface them now before month-end\n\n**Immediate action:**\nSort your clients by margin, not revenue — you'll discover who actually deserves your attention.`
    )
  }

  // ── SCORE / FIX ──────────────────────────────────────────────────────────
  if (aboutScore || aboutFix) {
    const issues: string[] = []
    if (!draft.hook) issues.push(pick('❌ لا يوجد هوك', '❌ Missing hook'))
    if (!draft.hashtags) issues.push(pick('❌ لا توجد هاشتاقات', '❌ No hashtags'))
    if (!draft.cta) issues.push(pick('❌ لا يوجد CTA', '❌ No CTA'))
    if (!draft.caption) issues.push(pick('⚠️ الكابشن فارغ', '⚠️ Empty caption'))
    return pick(
      `**تدقيق المحتوى:**\n\n${issues.length > 0 ? `**مشاكل مكتشفة:**\n${issues.join('\n')}\n\n` : '✅ المحتوى يبدو مكتملاً هيكلياً.\n\n'}**توزيع النقاط:**\n• قوة الهوك: 30 نقطة\n• جودة الكابشن: 25 نقطة\n• الهاشتاقات الصحيحة: 15 نقطة\n• CTA واضح: 20 نقطة\n• التوافق مع المنصة: 10 نقاط\n\nاضغط "Auto-Fix" أو أعطني المحتوى وسأحسّنه فوراً.`,
      `**Content Audit:**\n\n${issues.length > 0 ? `**Detected issues:**\n${issues.join('\n')}\n\n` : '✅ Content structure looks complete.\n\n'}**Score breakdown:**\n• Hook strength: 30 pts\n• Caption quality: 25 pts\n• Hashtag balance: 15 pts\n• Clear CTA: 20 pts\n• Platform fit: 10 pts\n\nClick "Auto-Fix" or share the content and I'll improve it immediately.`
    )
  }

  // ── CONVERT ──────────────────────────────────────────────────────────────
  if (aboutConvert || resolved === 'conversion_expert') {
    return pick(
      `**رؤية خبير التحويل:**\n\n**أقتل عوامل التحويل:**\n❌ CTA غامض ("تواصل معنا"، "زورونا")\n❌ لا urgency — لماذا الآن؟\n❌ التركيز على الميزات لا الفائدة الشخصية\n\n**صيغ CTA الأعلى تحويلاً:**\n• "أرسل [كلمة] في DM وأرسلها لك مجاناً"\n• "اضغط رابط البايو قبل انتهاء العرض"\n• "علّق '[عبارة]' وأرسل لك التفاصيل"\n\n**للإعلانات:** مشكلة (3 ثوانٍ) → حل (5 ثوانٍ) → CTA (2 ثوانٍ). هذا كل شيء.`,
      `**Conversion Expert View:**\n\n**Top conversion killers:**\n❌ Vague CTA ("Contact us," "Visit us")\n❌ No urgency — why now?\n❌ Feature-focused vs. personal benefit\n\n**High-converting CTA formulas:**\n• "DM [word] and I'll send it to you free"\n• "Tap link in bio before the offer ends"\n• "Comment '[phrase]' and I'll send you the details"\n\n**For ads:** Problem (3 sec) → Solution (5 sec) → CTA (2 sec). That's the full formula.`
    )
  }

  // ── STRATEGY ─────────────────────────────────────────────────────────────
  if (aboutStrategy) {
    const stAr: Record<string, string> = {
      tiktok: '**استراتيجية تيك توك:** 3-5 فيديو أسبوعياً • 15-30 ثانية للـ completion rate الأعلى • صوت ترند + هوك قوي + CTA للتعليق. الأداء في الأشهر الثلاثة الأولى = بناء الخوارزمية.',
      instagram: '**استراتيجية إنستقرام:** 40% Reels + 30% Carousel + 20% Stories + 10% Static. Carousel = أعلى save rate. Stories = أعلى reach مع المتابعين.',
    }
    return pick(
      `${stAr[platform] || '**الاستراتيجية الأسبوعية المثالية:**\n• محتوى تعليمي (40%)\n• محتوى ترفيهي أو إلهامي (35%)\n• محتوى مبيعاتي/ترويجي (25%)\n\nالاتساق في النشر يتفوق دائماً على الجودة المتقطعة.'}\n\n**ابدأ بهذا:**\n1. حدد موضوع الأسبوع\n2. اكتب الهوك أولاً\n3. بنِ باقي المحتوى حوله`,
      `${`**${platform?.toUpperCase() || 'General'} Strategy:**\nEducational (40%) + Entertaining/Inspirational (35%) + Promotional (25%) — the proven content mix.`}\n\n**Start here:**\n1. Define this week's theme\n2. Write the hook first\n3. Build the rest of the content around it`
    )
  }

  // ── INTELLIGENT GENERAL FALLBACK ─────────────────────────────────────────
  const modeLabel = pick(
    { content_strategist:'خبير المحتوى', viral_growth:'خبير الانتشار', premium_brand:'مستشار الهوية', conversion_expert:'خبير التحويل', account_manager:'مدير الحسابات', operations_manager:'مدير العمليات', financial_analyst:'المحلل المالي', auto:'نظام الذكاء الاصطناعي' }[resolved] || 'OpenClaw',
    { content_strategist:'Content Strategist', viral_growth:'Viral Growth Expert', premium_brand:'Brand Consultant', conversion_expert:'Conversion Expert', account_manager:'Account Manager', operations_manager:'Operations Manager', financial_analyst:'Financial Analyst', auto:'AI System' }[resolved] || 'OpenClaw'
  )
  return pick(
    `أنا هنا كـ **${modeLabel}** ⚡\n\n**يمكنني مساعدتك فوراً في:**\n• كتابة هوك قوي لمنشورك الجاي\n• اقتراح 3-5 أفكار محتوى لهذا الأسبوع\n• اختيار أفضل أسلوب تصوير للموضوع\n• تحديد ترند مناسب للعميل\n• تحسين كابشن موجود\n• كتابة سكريبت جاهز للتصوير\n• تحليل أداء المحتوى واقتراح خطة التحسين\n\nما الذي تريد العمل عليه الآن؟`,
    `I'm here as your **${modeLabel}** ⚡\n\n**I can help you immediately with:**\n• Writing a strong hook for your next post\n• Suggesting 3-5 content ideas for this week\n• Choosing the best clip style for the topic\n• Identifying a trending angle for the client\n• Improving an existing caption\n• Writing a ready-to-shoot script\n• Analyzing content performance and building an improvement plan\n\nWhat do you want to work on now?`
  )
}

// ─── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action, payload } = body
    const lang: 'ar' | 'en' = payload?.lang || 'en'
    const ctx: DashboardContext = payload?.context || { currentPage: 'dashboard', language: lang }
    const mode: SpecialistMode = payload?.mode || 'auto'

    let response: { success: boolean; data?: any; error?: string; requiresApproval?: boolean }

    if (action === 'generate_content') {
      response = await openClawService.generateContent(payload)
    } else if (action === 'analyze_workspace') {
      response = await openClawService.analyzeWorkspace(payload)
    } else if (action === 'distribute_tasks') {
      response = await openClawService.distributeTasks(payload.team, payload.tasks)
    } else if (action === 'generate_reminders') {
      response = await openClawService.generateSmartReminders(payload.client)
    } else if (action === 'chat') {
      const systemPrompt = buildSystemPrompt(ctx, mode, lang)
      const chatPrompt = systemPrompt +
        '\n\n--- CONVERSATION ---\n' +
        payload.messages.map((m: any) => `${m.role === 'user' ? 'User' : 'OpenClaw'}: ${m.content}`).join('\n') +
        '\nOpenClaw:'

      let replyText: string | null = null
      try {
        const gwRes = await fetch(`${process.env.OPENCLAW_ENDPOINT || 'http://localhost:18789'}/v1/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.OPENCLAW_API_KEY ? { Authorization: `Bearer ${process.env.OPENCLAW_API_KEY}` } : {}),
          },
          body: JSON.stringify({ model: process.env.OPENCLAW_MODEL_ID || 'default', prompt: chatPrompt, max_tokens: 800 }),
          signal: AbortSignal.timeout(8000),
        })
        if (gwRes.ok) {
          const gwJson = await gwRes.json()
          replyText = gwJson?.choices?.[0]?.text?.trim() || null
        }
      } catch (_) {
        // Gateway unavailable — use expert simulation
      }

      if (!replyText) {
        replyText = buildFallbackReply(payload.messages, ctx, mode, lang)
      }

      return NextResponse.json({ success: true, data: replyText })
    } else {
      return NextResponse.json({ success: false, error: 'Unknown action' }, { status: 400 })
    }

    if (!response!.success) {
      return NextResponse.json({ success: false, error: response!.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, data: response!.data, requiresApproval: response!.requiresApproval })
  } catch (error: any) {
    console.error('OpenClaw route error:', error)
    return NextResponse.json({ success: false, error: error.message || 'Internal Server Error' }, { status: 500 })
  }
}
