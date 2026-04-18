import { NextResponse } from 'next/server'

// ─── Types ─────────────────────────────────────────────────────────────────────
export type ConfidenceLevel = 'data-based' | 'strong-inference' | 'recommended-test'

interface IntelligenceItem {
  id: string
  title: string
  titleAr: string
  reasoning: string
  reasoningAr: string
  confidence: ConfidenceLevel
  source: string
  sourceAr: string
  value?: string
  tags?: string[]
}

interface PostingWindow {
  day: string
  dayAr: string
  timeSlot: string
  timeSlotAr: string
  reasoning: string
  reasoningAr: string
  confidence: ConfidenceLevel
  engagementScore: number // 1-100 relative
}

interface HookSuggestion {
  hook: string
  hookAr?: string
  framework: string
  frameworkAr: string
  trigger: string
  triggerAr: string
  platformFit: number // 1-10
  whyItWorks: string
  whyItWorksAr: string
  confidence: ConfidenceLevel
}

// ─── Posting Window Engine ──────────────────────────────────────────────────────
function buildPostingWindows(
  platform: string,
  audience: string,
  region: string,
  niche: string,
  hasPerformanceData: boolean,
  lang: 'ar' | 'en'
): PostingWindow[] {

  // Platform-specific behavioral reasoning
  // Source: Widely documented platform usage studies, not proprietary secrets
  const windowsByPlatform: Record<string, PostingWindow[]> = {

    tiktok: [
      {
        day: 'Friday', dayAr: 'الجمعة',
        timeSlot: '7:00 PM – 10:00 PM', timeSlotAr: '7:00 م – 10:00 م',
        reasoning: 'Friday evenings show consistently high TikTok usage across GCC markets because weekend begins Thursday night and peaks Friday. Users are relaxed, browsing mode, high scroll depth.',
        reasoningAr: 'مساء الجمعة يُظهر استخداماً عالياً في دول الخليج لأن بداية العطلة تعني وضع التصفح الطويل. المستخدم في حالة استرخاء وعمق التمرير أعلى.',
        confidence: 'strong-inference',
        engagementScore: 92,
      },
      {
        day: 'Saturday', dayAr: 'السبت',
        timeSlot: '10:00 AM – 1:00 PM', timeSlotAr: '10:00 ص – 1:00 م',
        reasoning: 'Saturday morning is a prime browsing window before midday. GCC region weekend midmorning shows high content consumption in the 18-34 demographic.',
        reasoningAr: 'صباح السبت نافذة تصفح ممتازة قبل منتصف النهار. فئة 18-34 في الخليج تستهلك محتوى بكثافة في هذا الوقت.',
        confidence: 'strong-inference',
        engagementScore: 85,
      },
      {
        day: 'Tuesday–Thursday', dayAr: 'الثلاثاء – الخميس',
        timeSlot: '12:00 PM – 2:00 PM', timeSlotAr: '12:00 م – 2:00 م',
        reasoning: 'Midweek lunch breaks produce a reliable but moderate engagement window. Users check phones during breaks — lighter engagement than evening peaks.',
        reasoningAr: 'استراحة الغداء منتصف الأسبوع تُنتج نافذة تفاعل منتظمة ولكن معتدلة. المستخدمون يتصفحون خلال الاستراحات.',
        confidence: 'strong-inference',
        engagementScore: 68,
      },
    ],

    instagram: [
      {
        day: 'Tuesday & Thursday', dayAr: 'الثلاثاء والخميس',
        timeSlot: '5:00 PM – 8:00 PM', timeSlotAr: '5:00 م – 8:00 م',
        reasoning: 'Studies consistently show mid-week evenings as top Instagram engagement windows globally. GCC-specific patterns reinforce Tuesday/Thursday because Monday and Wednesday carry heavier work loads.',
        reasoningAr: 'مساء منتصف الأسبوع موثّق باستمرار كأعلى نوافذ تفاعل في إنستقرام. في دول الخليج، الثلاثاء والخميس أعلى أداءً لأن عبء العمل أخف.',
        confidence: 'strong-inference',
        engagementScore: 88,
      },
      {
        day: 'Saturday', dayAr: 'السبت',
        timeSlot: '9:00 AM – 12:00 PM', timeSlotAr: '9:00 ص – 12:00 م',
        reasoning: 'Weekend morning on Instagram is a browsing-first environment. Users scroll without intent to act, but Saves and shares are highest in this window — which signals long-term algorithmic reach.',
        reasoningAr: 'صباح العطلة في إنستقرام بيئة تصفح بدون نية فورية، لكن معدل الحفظ والمشاركة أعلى في هذه النافذة — مما يدعم الوصول الخوارزمي على المدى الطويل.',
        confidence: 'strong-inference',
        engagementScore: 83,
      },
      {
        day: 'Wednesday', dayAr: 'الأربعاء',
        timeSlot: '11:00 AM – 1:00 PM', timeSlotAr: '11:00 ص – 1:00 م',
        reasoning: 'Wednesday midday shows a plateau engagement pattern — reliable but not peak. Useful for non-priority content or testing new formats with lower stakes.',
        reasoningAr: 'ظهر الأربعاء يُظهر نمط تفاعل ثابت ومعتدل — مناسب للمحتوى غير الأولوي أو اختبار أساليب جديدة.',
        confidence: 'recommended-test',
        engagementScore: 65,
      },
    ],

    snapchat: [
      {
        day: 'Sunday–Thursday', dayAr: 'الأحد – الخميس',
        timeSlot: '8:00 PM – 11:00 PM', timeSlotAr: '8:00 م – 11:00 م',
        reasoning: 'Snapchat\'s primary audience (Gen Z) is most active in evening hours after school or work. Evening is the dominant Snapchat session time across GCC.',
        reasoningAr: 'الجمهور الأساسي لسناب شات (جيل Z) أكثر نشاطاً مساءً بعد المدرسة أو العمل. الس الليلية هي الوقت المهيمن في دول الخليج.',
        confidence: 'strong-inference',
        engagementScore: 87,
      },
      {
        day: 'Weekend (Fri–Sat)', dayAr: 'نهاية الأسبوع (الجمعة–السبت)',
        timeSlot: '10:00 AM – 2:00 PM', timeSlotAr: '10:00 ص – 2:00 م',
        reasoning: 'On weekends, Snapchat daily windows extend into mid-morning. Users browse casually for longer periods with higher story-completion rates.',
        reasoningAr: 'في عطلة نهاية الأسبوع، تمتد نوافذ التصفح إلى منتصف الصباح. المستخدمون يتصفحون لفترات أطول مع معدل إكمال القصص أعلى.',
        confidence: 'strong-inference',
        engagementScore: 79,
      },
    ],

    google_ads: [
      {
        day: 'Tuesday–Thursday', dayAr: 'الثلاثاء – الخميس',
        timeSlot: '9:00 AM – 5:00 PM', timeSlotAr: '9:00 ص – 5:00 م',
        reasoning: 'B2B and high-intent searches peak mid-week during business hours. Decision-makers actively research during this window. Monday shows lower intent; Friday shows lower action rates.',
        reasoningAr: 'عمليات البحث عالية النية (B2B) تبلغ ذروتها في منتصف الأسبوع أثناء ساعات العمل. صانعو القرار يبحثون بنشاط في هذه النافذة.',
        confidence: 'strong-inference',
        engagementScore: 90,
      },
      {
        day: 'Saturday–Sunday', dayAr: 'السبت – الأحد',
        timeSlot: '7:00 PM – 10:00 PM', timeSlotAr: '7:00 م – 10:00 م',
        reasoning: 'Consumer-focused ads (B2C, e-commerce) perform better on weekend evenings when purchase intent is driven by browsing behavior rather than work-mode thinking.',
        reasoningAr: 'الإعلانات الموجهة للمستهلك (B2C، التجارة الإلكترونية) تؤدي بشكل أفضل في المساء خلال نهاية الأسبوع عندما تكون نية الشراء مدفوعة بسلوك التصفح الترفيهي.',
        confidence: 'strong-inference',
        engagementScore: 78,
      },
    ],
  }

  const windows = windowsByPlatform[platform] || windowsByPlatform['instagram']

  // If hasPerformanceData — add a data-priority note as the first item
  if (hasPerformanceData) {
    return [
      {
        day: 'Your top-performing day', dayAr: 'يومك الأعلى أداءً',
        timeSlot: 'From account analytics', timeSlotAr: 'من تحليلات الحساب',
        reasoning: 'Your account has historical performance data. Check the Analytics section for exact peak engagement hours — those figures override all general estimates.',
        reasoningAr: 'حسابك يملك بيانات أداء تاريخية. تحقق من قسم الأنالتيكس لمعرفة ساعات الذروة الفعلية — هذه الأرقام تتفوق على أي تقديرات عامة.',
        confidence: 'data-based',
        engagementScore: 100,
      },
      ...windows
    ]
  }

  return windows
}

// ─── Hook Intelligence Engine ───────────────────────────────────────────────────
function buildHookLibrary(
  platform: string,
  topic: string,
  goal: string,
  audience: string,
  tone: string,
  lang: 'ar' | 'en'
): HookSuggestion[] {

  const topicLabel = topic || (lang === 'ar' ? 'موضوعك' : 'your topic')
  const audienceLabel = audience || (lang === 'ar' ? 'جمهورك' : 'your audience')

  // Hook frameworks grounded in attention psychology + platform behavior
  const frameworks = [

    // Curiosity Gap — Loewenstein's Information Gap Theory
    {
      hook: `What nobody tells you about ${topicLabel} — and why it matters`,
      hookAr: `ما لا يخبرك به أحد عن ${topicLabel} — وسبب أهميته الكبيرة`,
      framework: 'Curiosity Gap (Information Gap Theory)',
      frameworkAr: 'فجوة الفضول — نظرية الفجوة المعلوماتية',
      trigger: 'Curiosity + mild frustration at being uninformed',
      triggerAr: 'الفضول + الإزعاج الخفيف من غياب المعلومة',
      platformFit: platform === 'tiktok' ? 9 : platform === 'instagram' ? 8 : 6,
      whyItWorks: 'Creates an information gap the mind cannot ignore. "Nobody tells you" implies insider knowledge — activates fear of missing out on crucial information.',
      whyItWorksAr: 'يخلق فجوة معلوماتية لا يستطيع العقل تجاهلها. "لا يخبرك أحد" تُوحي بمعرفة داخلية — تُفعّل الخوف من تفويت معلومة مهمة.',
      confidence: 'strong-inference' as ConfidenceLevel,
    },

    // Pain Point Shock — Direct Problem Framing
    {
      hook: `You're doing ${topicLabel} wrong — and it's costing you`,
      hookAr: `أنت تتعامل مع ${topicLabel} بشكل خاطئ — وهذا يكلّفك كثيراً`,
      framework: 'Pain Point Shock — Direct Problem Framing',
      frameworkAr: 'صدمة نقطة الألم — الإطار المباشر للمشكلة',
      trigger: 'Fear of loss / fear of wasted effort',
      triggerAr: 'الخوف من الخسارة / الخوف من إهدار الجهد',
      platformFit: platform === 'tiktok' ? 10 : platform === 'tiktok' ? 9 : 8,
      whyItWorks: 'Loss aversion is one of the most consistent behavioral triggers. "You\'re doing it wrong" immediately makes the viewer feel their current approach is at risk — they must stop and listen.',
      whyItWorksAr: 'تجنب الخسارة من أقوى المحفزات السلوكية. "أنت تفعله بشكل خاطئ" يجعل المشاهد يشعر فوراً أن طريقته الحالية في خطر — فيضطر للتوقف والاستماع.',
      confidence: 'strong-inference' as ConfidenceLevel,
    },

    // POV Immersion — Role / Perspective Shift
    {
      hook: platform === 'tiktok'
        ? `POV: You just discovered the truth about ${topicLabel}`
        : `Imagine if ${topicLabel} could change everything for ${audienceLabel}`,
      hookAr: platform === 'tiktok'
        ? `POV: اكتشفت للتو الحقيقة عن ${topicLabel}`
        : `تخيّل لو أن ${topicLabel} يمكن أن يغيّر كل شيء لـ${audienceLabel}`,
      framework: 'POV Immersion — Perspective Shift',
      frameworkAr: 'الانغماس في المنظور — تحوّل الزاوية',
      trigger: 'Identification + empathy + personal relevance',
      triggerAr: 'التماهي + التعاطف + الصلة الشخصية',
      platformFit: platform === 'tiktok' ? 10 : platform === 'snapchat' ? 8 : 7,
      whyItWorks: 'POV format places the viewer directly in an experience — they simulate the feeling before consciously evaluating. TikTok\'s format is built for this: immersive, first-person, immediate.',
      whyItWorksAr: 'صيغة POV تضع المشاهد مباشرة في التجربة — يحاكي الشعور قبل التقييم الواعي. صيغة تيك توك مبنية على هذا: انغماسية، منظور أول، فورية.',
      confidence: 'strong-inference' as ConfidenceLevel,
    },

    // Authority Pattern Interrupt — Expert Contradiction
    {
      hook: `Stop doing this with ${topicLabel} immediately`,
      hookAr: `توقف عن فعل هذا مع ${topicLabel} فوراً`,
      framework: 'Authority Pattern Interrupt',
      frameworkAr: 'مقاطعة النمط بالسلطة',
      trigger: 'Urgency + authority signal + fear of ongoing mistake',
      triggerAr: 'الاستعجال + إشارة السلطة + الخوف من الخطأ المستمر',
      platformFit: platform === 'tiktok' ? 9 : 8,
      whyItWorks: '"Stop" is one of the most pattern-interrupting words in any language. The command voice implies authority. Combined with "immediately" — it creates urgency that overrides the scroll instinct.',
      whyItWorksAr: '"توقف" من أقوى الكلمات المقاطِعة للنمط في أي لغة. صوت الأمر يُوحي بالسلطة. مقترن بـ"فوراً" — يخلق إلحاحاً يتجاوز غريزة التمرير.',
      confidence: 'strong-inference' as ConfidenceLevel,
    },

    // Social Proof Shock — Surprising Statistic
    {
      hook: goal === 'awareness' || goal === 'engagement'
        ? `Most ${audienceLabel} don't realize this about ${topicLabel}`
        : `Here's what actually works for ${topicLabel} — tested and proven`,
      hookAr: goal === 'awareness' || goal === 'engagement'
        ? `معظم ${audienceLabel} لا يُدركون هذا عن ${topicLabel}`
        : `هذا ما يعمل فعلاً مع ${topicLabel} — مُجرَّب ومثبت`,
      framework: goal?.includes('sales') ? 'Social Proof + Credibility Signal' : 'Majority Contrast (Social Norm Violation)',
      frameworkAr: goal?.includes('sales') ? 'الدليل الاجتماعي + إشارة المصداقية' : 'التباين الأغلبي (انتهاك المعيار الاجتماعي)',
      trigger: goal?.includes('sales') ? 'Trust + reducing purchase risk' : 'Social comparison + feeling of being in the minority that needs to know',
      triggerAr: goal?.includes('sales') ? 'الثقة + تقليل مخاطر الشراء' : 'المقارنة الاجتماعية + الشعور بأن الأقلية تحتاج لمعرفة ذلك',
      platformFit: platform === 'instagram' ? 9 : platform === 'google_ads' ? 8 : 7,
      whyItWorks: '"Most people don\'t realize" creates an us-vs-them framing where the viewer wants to be on the informed side. For sales content, proven results reduce the friction of skepticism.',
      whyItWorksAr: '"معظم الناس لا يُدركون" يخلق إطار "نحن مقابل هم" حيث يريد المشاهد أن يكون في الجانب المُطّلع. للمحتوى البيعي، النتائج المثبتة تقلل احتكاك الشك.',
      confidence: 'strong-inference' as ConfidenceLevel,
    },

    // Specificity Signal — Exact Number / Timeframe
    {
      hook: `In the next 60 seconds, I\'ll show you how ${topicLabel} can change your results`,
      hookAr: `في الثواني الستين القادمة، سأريك كيف يُغيّر ${topicLabel} نتائجك`,
      framework: 'Specificity Signal + Time Commitment Contract',
      frameworkAr: 'إشارة التحديد + عقد الالتزام الزمني',
      trigger: 'Curiosity + low commitment (only 60 seconds) + promise of clear value',
      triggerAr: 'الفضول + التزام منخفض (60 ثانية فقط) + وعد بقيمة واضحة',
      platformFit: platform === 'tiktok' ? 8 : platform === 'instagram' ? 7 : 6,
      whyItWorks: 'Specificity ("60 seconds") is trusted over vague promises. It also signals to the viewer that the time investment is low — removing procrastination friction.',
      whyItWorksAr: 'التحديد ("60 ثانية") أكثر مصداقية من الوعود الغامضة. كما يُشير للمشاهد أن الاستثمار الزمني منخفض — مما يُزيل احتكاك التسويف.',
      confidence: 'recommended-test' as ConfidenceLevel,
    },
  ]

  // Filter/rank by platform fit
  return frameworks
    .sort((a, b) => b.platformFit - a.platformFit)
    .slice(0, 5)
}

// ─── Platform Strategy Insights ────────────────────────────────────────────────
function buildPlatformInsights(
  platform: string,
  topic: string,
  goal: string,
  audience: string,
  contentDraft: any,
  lang: 'ar' | 'en'
): IntelligenceItem[] {

  const draft = contentDraft || {}
  const hasDraft = !!draft.hook || !!draft.caption
  const hasHashtags = !!draft.hashtags
  const hasCTA = !!draft.cta

  const items: IntelligenceItem[] = []

  if (platform === 'tiktok') {
    items.push({
      id: 'tiktok-hook-priority',
      title: 'Hook Window: First 1–2 Seconds are Make or Break',
      titleAr: 'نافذة الهوك: الثانيتان الأوليان هما كل شيء',
      reasoning: 'TikTok\'s algorithm distributes content in batches. The most critical signal in the first distribution is average watch time. If the hook fails to retain viewers past second 2–3, the batch won\'t receive a second push. This is not a secret — it\'s confirmed by how FYP distribution mechanics work.',
      reasoningAr: 'خوارزمية تيك توك توزّع المحتوى على دفعات. الإشارة الأكثر أهمية في التوزيع الأول هي متوسط وقت المشاهدة. إذا فشل الهوك في إبقاء المشاهدين بعد الثانيتين 2-3، لن تحصل الدفعة على دفع ثانٍ.',
      confidence: 'strong-inference',
      source: 'Platform distribution mechanics + content performance patterns',
      sourceAr: 'آليات توزيع المنصة + أنماط أداء المحتوى',
      tags: ['hook', 'watch-time', 'distribution'],
    })
    items.push({
      id: 'tiktok-comment-cta',
      title: 'Comments Drive Reach — Build CTAs Around This',
      titleAr: 'التعليقات تقود الانتشار — ابنِ CTA حولها',
      reasoning: 'Comment velocity is a strong secondary signal in TikTok\'s distribution. Posts that trigger comments early (especially in first 30 minutes) receive broader distribution. CTAs asking users to "comment [word]" consistently outperform "follow us" or "save this" in driving algorithmic push.',
      reasoningAr: 'سرعة التعليقات إشارة ثانوية قوية في توزيع تيك توك. المنشورات التي تُحفز التعليقات مبكراً (خاصة في أول 30 دقيقة) تحصل على توزيع أوسع.',
      confidence: 'strong-inference',
      source: 'Observed content performance patterns across TikTok accounts',
      sourceAr: 'أنماط أداء المحتوى الملاحظة عبر حسابات تيك توك',
      tags: ['CTA', 'comments', 'reach'],
    })
    if (!hasCTA) {
      items.push({
        id: 'tiktok-missing-cta',
        title: 'Action Required: No CTA Detected in Draft',
        titleAr: 'إجراء مطلوب: لا يوجد CTA في المسودة الحالية',
        reasoning: 'Your current draft has no Call to Action. On TikTok, the lack of a clear CTA results in passive consumption — the viewer watches and moves on without the behavioral signal (comment, share, follow) that drives algorithmic reach.',
        reasoningAr: 'مسودتك الحالية لا تحتوي على CTA. في تيك توك، غياب CTA واضح ينتج عنه استهلاك سلبي — المشاهد يشاهد ويمضي بدون الإشارة السلوكية (تعليق، مشاركة، متابعة) التي تقود الانتشار الخوارزمي.',
        confidence: 'data-based',
        source: 'Current content draft analysis',
        sourceAr: 'تحليل المسودة الحالية',
        tags: ['warning', 'CTA', 'draft'],
      })
    }
  }

  if (platform === 'instagram') {
    items.push({
      id: 'ig-save-signal',
      title: 'Saves are the Strongest Signal — Optimize for Them',
      titleAr: 'الحفظ هو أقوى إشارة — حسّن المحتوى من أجله',
      reasoning: 'Instagram\'s recommendation system heavily weights Save and Share actions over Likes for determining content quality. A post with 50 saves and 200 likes is algorithmically stronger than a post with 0 saves and 2,000 likes. Creates content that has "refer-back" value — lists, guides, step-by-step breakdowns.',
      reasoningAr: 'نظام التوصية في إنستقرام يُعطي وزناً أعلى للحفظ والمشاركة مقارنة بالإعجابات في تحديد جودة المحتوى. المنشور الذي يحصل على 50 حفظاً و200 إعجاب أقوى خوارزمياً من المنشور الذي يحصل على 0 حفظ و2000 إعجاب.',
      confidence: 'strong-inference',
      source: 'Instagram content behavior and distribution mechanics',
      sourceAr: 'سلوك محتوى إنستقرام وآليات التوزيع',
      tags: ['saves', 'algorithm', 'reach'],
    })
    items.push({
      id: 'ig-hashtag-strategy',
      title: 'Hashtag Mix: Broad + Mid-tier + Niche Gets Best Distribution',
      titleAr: 'مزيج الهاشتاقات: واسع + متوسط + نيش يُعطي أفضل توزيع',
      reasoning: 'Using only broad hashtags (10M+) means your content competes in an extremely saturated space where new accounts are invisible. Using only niche hashtags (under 10K) limits exposure ceiling. The effective strategy: 3–4 broad (10M+), 5–6 mid-tier (100K–1M), 3–5 niche (under 100K).',
      reasoningAr: 'استخدام هاشتاقات واسعة فقط (+10M) يعني التنافس في مساحة مشبعة جداً حيث الحسابات الجديدة غير مرئية. استخدام هاشتاقات نيش فقط (أقل من 10K) يحد من سقف التعرض. الاستراتيجية الفعّالة: 3-4 واسعة + 5-6 متوسطة + 3-5 نيش.',
      confidence: 'strong-inference',
      source: 'Instagram hashtag performance patterns and account growth studies',
      sourceAr: 'أنماط أداء هاشتاقات إنستقرام ودراسات نمو الحسابات',
      tags: ['hashtags', 'reach', 'distribution'],
    })
    if (!hasHashtags) {
      items.push({
        id: 'ig-missing-hashtags',
        title: 'Warning: No Hashtags in Current Draft',
        titleAr: 'تحذير: لا توجد هاشتاقات في المسودة الحالية',
        reasoning: 'Instagram uses hashtags as a primary discovery signal for non-followers. Without them, organic reach is limited to your existing follower base — no new audience discovery.',
        reasoningAr: 'إنستقرام يستخدم الهاشتاقات كإشارة اكتشاف أساسية لغير المتابعين. بدونها، الوصول العضوي محدود بقاعدة متابعيك الحالية — لا اكتشاف لجمهور جديد.',
        confidence: 'data-based',
        source: 'Current draft analysis',
        sourceAr: 'تحليل المسودة الحالية',
        tags: ['warning', 'hashtags', 'draft'],
      })
    }
  }

  if (platform === 'snapchat') {
    items.push({
      id: 'snap-completion',
      title: 'Story Completion Rate is Snapchat\'s Core Quality Signal',
      titleAr: 'معدل إكمال القصة هو إشارة الجودة الأساسية في سناب شات',
      reasoning: 'Unlike TikTok or Instagram, Snapchat prioritizes story completion over initial views. A short story (3–5 snaps) with 80% completion is algorithmically favored over a 12-snap story with 30% completion. Keep stories tight and each snap must earn the next one.',
      reasoningAr: 'على عكس تيك توك وإنستقرام، سناب شات يُعطي الأولوية لإكمال القصة على المشاهدات الأولية. قصة قصيرة (3-5 سنابات) بإكمال 80% تحظى بأفضلية خوارزمية على قصة مكونة من 12 سناباً بإكمال 30%.',
      confidence: 'strong-inference',
      source: 'Snapchat story distribution behavior patterns',
      sourceAr: 'أنماط توزيع قصص سناب شات',
      tags: ['completion-rate', 'stories', 'distribution'],
    })
  }

  if (platform === 'google_ads') {
    items.push({
      id: 'gads-intent-match',
      title: 'Keyword Intent Match is the #1 Quality Factor',
      titleAr: 'مطابقة نية الكلمة المفتاحية هي عامل الجودة الأول',
      reasoning: 'Google Ads rewards ads where the keyword intent, ad copy, and landing page experience form a coherent chain. A quality score below 6 means higher CPCs and lower ad positions — regardless of bid amount. The headline must contain the primary keyword or a close variation.',
      reasoningAr: 'جوجل أدز يُكافئ الإعلانات التي تُكوّن نية الكلمة المفتاحية ونص الإعلان وتجربة صفحة الهبوط سلسلة متماسكة. نقاط الجودة أقل من 6 تعني تكلفة نقرة أعلى وتصنيفات إعلانات أدنى — بغض النظر عن مبلغ العطاء.',
      confidence: 'strong-inference',
      source: 'Google Ads Quality Score mechanics and documented CPC factors',
      sourceAr: 'آليات نقاط جودة جوجل أدز وعوامل تكلفة النقرة الموثّقة',
      tags: ['quality-score', 'keywords', 'CTR'],
    })
  }

  // Add general content draft analysis if draft exists
  if (hasDraft && draft.hook) {
    const hookLength = draft.hook.length
    if (hookLength > 120) {
      items.push({
        id: 'hook-too-long',
        title: 'Draft Analysis: Hook May Be Too Long for First Impression',
        titleAr: 'تحليل المسودة: الهوك قد يكون طويلاً جداً للانطباع الأول',
        reasoning: `Your current hook is ${hookLength} characters. On ${platform === 'tiktok' ? 'TikTok' : platform === 'instagram' ? 'Instagram' : 'social platforms'}, the hook must land within 1–2 seconds of speech or reading. Aim for under 10 words for the opening line — save complexity for the body.`,
        reasoningAr: `هوكك الحالي مكوّن من ${hookLength} حرفاً. في ${platform === 'tiktok' ? 'تيك توك' : platform === 'instagram' ? 'إنستقرام' : 'منصات السوشيال'}, يجب أن يصل الهوك خلال 1-2 ثانية من الكلام أو القراءة. استهدف أقل من 10 كلمات في السطر الافتتاحي.`,
        confidence: 'data-based',
        source: 'Current draft analysis (hook character count)',
        sourceAr: 'تحليل المسودة الحالية (عدد أحرف الهوك)',
        tags: ['hook', 'length', 'draft-analysis'],
      })
    }
  }

  return items
}

// ─── Route Handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const {
      platform = 'instagram',
      lang = 'en',
      topic = '',
      goal = '',
      audience = '',
      tone = '',
      niche = '',
      region = 'GCC',
      contentDraft,
      hasPerformanceData = false,
    } = body

    const postingWindows = buildPostingWindows(platform, audience, region, niche, hasPerformanceData, lang)
    const hookLibrary    = buildHookLibrary(platform, topic, goal, audience, tone, lang)
    const insights       = buildPlatformInsights(platform, topic, goal, audience, contentDraft, lang)

    return NextResponse.json({
      success: true,
      data: {
        postingWindows,
        hookLibrary,
        insights,
        meta: {
          platform,
          lang,
          hasPerformanceData,
          confidenceNote: lang === 'ar'
            ? 'جميع التوصيات مبنية على: بيانات المسودة الحالية، منطق سلوك المنصة، وأنماط أداء المحتوى. لا توجد توصيات عشوائية.'
            : 'All recommendations are grounded in: current draft data, platform behavior logic, and content performance patterns. No random outputs.',
          generatedAt: new Date().toISOString(),
        }
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
