import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  try {
    const { platform, topic, field, lang = 'en', currentContext } = await req.json()
    await new Promise(resolve => setTimeout(resolve, Math.random() * 600 + 300))

    const ctx = (topic || currentContext || 'حملة تسويقية').trim()
    const isAr = lang === 'ar'
    let suggestions: string[] = []

    // ── HOOK ──────────────────────────────────────────────────────────────────
    if (field === 'hook') {
      if (platform === 'tiktok') {
        suggestions = isAr ? [
          `توقف — هذا سيغير طريقة تفكيرك في ${ctx} إلى الأبد`,
          `POV: اكتشفت السر الحقيقي وراء ${ctx} بعد سنوات من المحاولة`,
          `الحقيقة عن ${ctx} التي لا يريدك أحد أن تعرفها`,
          `ما الخطأ الذي يكرره الجميع في ${ctx}؟ الجواب صادم`,
          `في 30 ثانية ستعرف لماذا نجح الآخرون في ${ctx} وأنت لم تنجح بعد`,
        ] : [
          `POV: You just discovered the ${ctx} secret nobody talks about`,
          `Stop scrolling — this ${ctx} truth will change everything`,
          `Why 90% of people fail at ${ctx} (and how to not be one of them)`,
          `I spent 3 years on ${ctx} so you don't have to — here's what I learned`,
          `The ${ctx} mistake you're probably making right now`,
        ]
      } else if (platform === 'instagram') {
        suggestions = isAr ? [
          `الحقيقة عن ${ctx} التي لا يخبرك بها أحد... 👇`,
          `احفظ هذا المنشور قبل أن تبدأ رحلتك مع ${ctx} ✨`,
          `شاهد حتى النهاية — هذا ما غيّر كل شيء في ${ctx} 🔥`,
          `3 أشياء أتمنى أن يخبرني بها أحد عن ${ctx} قبل أن أبدأ`,
          `لو كنت سأبدأ من جديد في ${ctx}، هذا ما كنت سأفعله`,
        ] : [
          `The ${ctx} truth nobody tells you... 👇`,
          `Save this before you start your ${ctx} journey ✨`,
          `Watch until the end — this changed everything about ${ctx} 🔥`,
          `3 things I wish someone told me about ${ctx}`,
          `If I could start ${ctx} over, here's exactly what I'd do`,
        ]
      } else if (platform === 'snapchat') {
        suggestions = isAr ? [
          `${ctx} فعلاً؟ 🤯`,
          `الحقيقة عن ${ctx}`,
          `لن تصدق ${ctx}`,
        ] : [
          `${ctx}? Watch this 🤯`,
          `The truth about ${ctx}`,
          `You won't believe ${ctx}`,
        ]
      } else { // google_ads
        suggestions = isAr ? [
          `احصل على أفضل ${ctx} — عرض محدود`,
          `${ctx} مجاناً — سارع الآن`,
          `الحل الأمثل لـ ${ctx} في السوق السعودي`,
        ] : [
          `Get the Best ${ctx} — Limited Offer`,
          `${ctx} Free Trial — Start Today`,
          `#1 ${ctx} Solution — Trusted by 10,000+`,
        ]
      }

    // ── CAPTION ───────────────────────────────────────────────────────────────
    } else if (field === 'caption') {
      if (platform === 'tiktok') {
        suggestions = isAr ? [
          `كثير من الناس يقضون سنوات يحاولون فهم ${ctx} دون أن يصلوا لنتيجة حقيقية.\n\nالسبب؟ ليس الجهد — بل المعلومة الخاطئة.\n\nفي هذا الفيديو كسرت كل القواعد المعتادة وطبّقت ما لا يتحدث عنه أحد.\n\nالنتائج تكلّمت عن نفسها. 💯\n\nعلّق برأيك 👇`,
          `ثلاث سنوات وأنا أعمل في ${ctx}.\n\nالدرس الأهم الذي تعلمته؟\n\nلا تبدأ بالأدوات — ابدأ بالعقلية الصحيحة.\n\nكل شيء آخر تفصيل. 🎯\n\nشارك هذا مع شخص يحتاجه الآن 🔁`,
        ] : [
          `Most people spend years trying to crack ${ctx} without real results.\n\nWhy? Not lack of effort — wrong information.\n\nIn this video I broke every conventional rule and applied what nobody talks about.\n\nThe results spoke for themselves. 💯\n\nDrop your thoughts below 👇`,
          `3 years working in ${ctx} taught me one critical lesson:\n\nDon't start with tools — start with the right mindset.\n\nEverything else is detail. 🎯\n\nShare with someone who needs this right now 🔁`,
        ]
      } else if (platform === 'instagram') {
        suggestions = isAr ? [
          `قضيت أشهراً أدرس ${ctx} وأجرّب وأفشل وأبدأ من جديد.\n\nوعندما نجحت أخيراً، أدركت أن الإجابة كانت بسيطة جداً.\n\nكل ما احتجته كان:\n• تركيز حقيقي على الأساسيات\n• صبر بدون توقعات مبالغة\n• استعداد للتكيف وليس التمسك بخطة واحدة\n\nاحفظ هذا المنشور عندما تشعر بالإحباط. ❤️`,
        ] : [
          `I spent months studying ${ctx}, experimenting, failing, and starting over.\n\nWhen it finally worked, I realized the answer was surprisingly simple.\n\nAll it took was:\n• Real focus on fundamentals\n• Patience without inflated expectations\n• Willingness to adapt, not stick to one plan\n\nSave this post for when you feel frustrated. ❤️`,
        ]
      } else {
        suggestions = isAr ? [
          `نحن نحل مشكلة ${ctx} بطريقة مختلفة تماماً عن الجميع.\n\nلا وعود فارغة — نتائج حقيقية يمكنك قياسها.\n\nتواصل معنا اليوم وابدأ التغيير الحقيقي.`,
        ] : [
          `We solve ${ctx} in a completely different way.\n\nNo empty promises — real, measurable results.\n\nContact us today and start the real change.`,
        ]
      }

    // ── HASHTAGS ──────────────────────────────────────────────────────────────
    } else if (field === 'hashtags') {
      const base = ctx.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '').slice(0, 15) || 'marketing'
      if (platform === 'tiktok') {
        suggestions = isAr ? [
          `#fyp #foryoupage #${base} #${base}tips #viral #محتوى #ذا_للصفحه_الرئيسية`,
          `#tiktok #${base}hacks #trending #محتوى_عربي #fyp #viral #${base}`,
          `#${base} #${base}secrets #وكالة #تسويق #fyp #foryoupage`,
        ] : [
          `#fyp #foryoupage #${base} #${base}tips #viral #trending`,
          `#tiktok #${base}hacks #trending #contentcreator #fyp #${base}`,
          `#${base} #${base}secrets #marketing #growth #fyp #foryoupage`,
        ]
      } else if (platform === 'instagram') {
        suggestions = isAr ? [
          `#${base} #${base}tips #تسويق_رقمي #محتوى #وسائل_التواصل #سوشيال_ميديا #growth #marketing #${base}arabic`,
          `#${base}expert #${base}marketing #سعودي #الخليج #تسويق #ريلز #contentcreator`,
          `#${base} #${base}strategy #${base}hacks #instagram #reels #viral #socialmedia #تسويق`,
        ] : [
          `#${base} #${base}tips #digitalmarketing #contentcreator #instagramreels #socialmedia #growth`,
          `#${base}expert #${base}marketing #instagram #reels #viral #marketing #business`,
          `#${base} #${base}strategy #${base}hacks #instagram #reels #socialmedia`,
        ]
      } else {
        suggestions = isAr
          ? [`#${base} #${base}tips #تسويق #أعمال #نمو`]
          : [`#${base} #${base}tips #marketing #business #growth`]
      }

    // ── CTA ───────────────────────────────────────────────────────────────────
    } else if (field === 'cta') {
      suggestions = isAr ? [
        `أرسل كلمة "${ctx.split(' ')[0] || 'معلومات'}" في DM وأرسلها لك مجاناً 📩`,
        `اضغط رابط البايو قبل انتهاء العرض ⬆️`,
        `علّق "نعم" إذا كنت تريد مزيداً من المعلومات 👇`,
        `شارك مع شخص يحتاج هذا الآن 🔁`,
        `احجز استشارتك المجانية — أماكن محدودة 🎯`,
      ] : [
        `DM us "${ctx.split(' ')[0] || 'INFO'}" for free details 📩`,
        `Tap the link in bio before the offer ends ⬆️`,
        `Comment "YES" if you want more info like this 👇`,
        `Share with someone who needs this right now 🔁`,
        `Book your free consultation — limited spots 🎯`,
      ]
    }

    return NextResponse.json({ success: true, suggestions })
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to generate suggestions' }, { status: 500 })
  }
}
