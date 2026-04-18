'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Copy, RefreshCw, Check, AlertTriangle, Wand2, ArrowRight, Zap, Target,
  Award, Star, Type, Upload, Activity, Lock, Clock, CheckCircle2, XCircle,
  Loader2, Terminal, Eye, EyeOff, Plus, X, Edit3, Shield, User,
  Mail, Key, Sparkles, TrendingUp, Film, Lightbulb, ChevronDown,
  ChevronRight, BookmarkPlus, Hash, Mic, Play
} from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { processVideo, extractMetadata, generateThumbnail, ProcessingProgress, VideoMetadata } from '@/lib/media/processor'
import { createClient } from '@supabase/supabase-js'
import { useOpenClaw } from '@/lib/openclaw/context'
import { OpenClawIntelligencePanel } from './OpenClawIntelligencePanel'
import { addSocialAccount, updateSocialAccount } from '@/app/actions/social_accounts'

const supabaseBrowserClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key'
)

export type Platform = 'instagram' | 'tiktok' | 'snapchat' | 'google_ads'

interface Props {
  platform: Platform
  clients: { id: string; company_name: string }[]
  teamMembers: { id: string; full_name: string }[]
  socialAccounts?: any[]
}

type ExecStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked'
interface ExecLog {
  id: string; action: string; status: ExecStatus; timestamp: string
  output?: string; error?: string; fields?: string[]
}

// ─── Score Engine (Arabic-aware) ───────────────────────────────────────────────
function calculateScore(caption: string, hook: string, hashtags: string, platform: Platform, title: string, cta: string, lang: string) {
  let score = 100
  const warnings: { issue: string; issueAr: string; why: string; whyAr: string; fix: string; fixAr: string; severity: 'critical' | 'warning' }[] = []
  const len = caption.length + hook.length

  if (platform === 'tiktok') {
    if (hook.length < 10) {
      score -= 25; warnings.push({
        issue: 'Missing Hook', issueAr: 'الهوك مفقود',
        why: 'TikTok requires an immediate pattern interrupt in the first 1-2 seconds to prevent swipe-aways.',
        whyAr: 'تيك توك يحتاج صدمة فورية في أول ثانية لمنع التمرير. بدون هوك = تضيع 80% من الجمهور.',
        fix: 'Start with POV, a bold claim, or a direct provocative question.',
        fixAr: 'ابدأ بـ POV، ادعاء جريء، أو سؤال يستفز التوقف فوراً.',
        severity: 'critical'
      })
    }
    if (len > 300) {
      score -= 15; warnings.push({
        issue: 'Caption Too Long', issueAr: 'الكابشن طويل جداً',
        why: 'TikTok audiences skip long text. Punchy one-liners win.',
        whyAr: 'جمهور تيك توك لا يقرأ أكثر من جملة أو اثنتين. الإطالة = خسارة الاهتمام.',
        fix: 'Condense to 1-2 punchy lines max.',
        fixAr: 'اختصر إلى جملة أو جملتين قويتين فقط.',
        severity: 'warning'
      })
    }
    if (!hashtags.toLowerCase().includes('#fyp') && !hashtags.toLowerCase().includes('#viral') && !hashtags.toLowerCase().includes('#foryou')) {
      score -= 10; warnings.push({
        issue: 'Missing Algorithmic Tags', issueAr: 'هاشتاقات الخوارزمية مفقودة',
        why: 'FYP tags signal TikTok algorithm for discovery distribution.',
        whyAr: 'هاشتاقات #fyp و#foryoupage تخبر الخوارزمية أن توزع المحتوى للجمهور الأوسع.',
        fix: 'Add #fyp #viral #foryoupage to your hashtag set.',
        fixAr: 'أضف #fyp #foryoupage #viral لمجموعة الهاشتاقات.',
        severity: 'warning'
      })
    }
    if (!cta) {
      score -= 15; warnings.push({
        issue: 'No Engagement CTA', issueAr: 'لا توجد دعوة للتفاعل',
        why: 'Comments are the #1 signal for TikTok distribution. No CTA = missed reach.',
        whyAr: 'التعليقات هي أهم إشارة للخوارزمية في تيك توك. بدون CTA تخسر انتشاراً كبيراً.',
        fix: 'End with: "Comment [X]" or "Tell me in the comments".',
        fixAr: 'اختم بـ: "علّق [كلمة]" أو "قولوا لي في التعليقات".',
        severity: 'critical'
      })
    }
  } else if (platform === 'instagram') {
    if (len < 100) {
      score -= 15; warnings.push({
        issue: 'Thin Storytelling', issueAr: 'محتوى غير كافٍ',
        why: 'Instagram favors longer story-driven captions for increased dwell time.',
        whyAr: 'إنستقرام يكافئ المحتوى الغني بالقصص لأنه يزيد وقت التوقف عند المنشور.',
        fix: 'Expand the "why" or "how" behind your content.',
        fixAr: 'وسّع الكابشن بالقصة أو السبب — اجعل القارئ يشعر بشيء.',
        severity: 'warning'
      })
    }
    const tagCount = (hashtags.match(/#/g) || []).length
    if (tagCount < 5 || tagCount > 15) {
      score -= 10; warnings.push({
        issue: `Hashtag Imbalance (${tagCount} tags)`, issueAr: `خلل في الهاشتاقات (${tagCount} هاشتاق)`,
        why: 'Instagram optimal reach is 5-15 targeted hashtags — under or over hurts distribution.',
        whyAr: 'إنستقرام يعمل بشكل أفضل مع 5-15 هاشتاق مستهدف. أقل أو أكثر يضر بالوصول.',
        fix: 'Mix 3 broad (10M+) + 5 mid-tier (1-10M) + 3-5 niche (under 500K).',
        fixAr: 'اخلط: 3 واسعة (10M+) + 5 متوسطة (1-10M) + 3-5 نيش (أقل من 500K).',
        severity: 'warning'
      })
    }
    if (!cta.toLowerCase().match(/link in bio|save|share|comment|dm|احفظ|شارك|علق|بايو/)) {
      score -= 15; warnings.push({
        issue: 'Missing Engagement Trigger', issueAr: 'دعوة التفاعل مفقودة',
        why: 'Saves & shares are the strongest algorithmic signals on Instagram.',
        whyAr: 'الحفظ والمشاركة هما أقوى إشارات لخوارزمية إنستقرام — ابطلب منهم صراحة.',
        fix: 'Explicitly ask: "Save this post", "Share with someone who needs this", or "Link in bio".',
        fixAr: 'اطلب صراحة: "احفظ المنشور"، "شارك مع شخص يحتاجها"، أو "رابط البايو".',
        severity: 'critical'
      })
    }
  } else if (platform === 'snapchat') {
    if (title.length > 25) {
      score -= 20; warnings.push({
        issue: 'Title Too Long', issueAr: 'العنوان طويل',
        why: 'Snapchat titles must be instantly scannable — 3-4 words max.',
        whyAr: 'عنوان سناب شات يجب أن يُقرأ فورياً — 3-4 كلمات هو الحد الأقصى.',
        fix: 'Shorten to 3-4 impactful words.',
        fixAr: 'اختصر إلى 3-4 كلمات مؤثرة ومباشرة.',
        severity: 'critical'
      })
    }
    if (len > 80) {
      score -= 20; warnings.push({
        issue: 'Too Much Text', issueAr: 'نص كثير جداً',
        why: 'Snapchat is hyper-visual. Text kills the experience.',
        whyAr: 'سناب شات منصة بصرية بالكامل. النص الزائد يضعف التجربة ويخسر الجمهور.',
        fix: 'Move storytelling to the video/visual. Keep on-screen text minimal.',
        fixAr: 'انقل القصة للفيديو/الصورة. ابقِ النص على الشاشة بحده الأدنى.',
        severity: 'critical'
      })
    }
  } else if (platform === 'google_ads') {
    if (title.length < 15) {
      score -= 20; warnings.push({
        issue: 'Weak Headline', issueAr: 'عنوان ضعيف',
        why: 'Google Ads CTR is entirely driven by headline strength.',
        whyAr: 'نسبة النقر في جوجل أدز تعتمد كلياً على قوة العنوان.',
        fix: 'Include your main keyword + a clear, specific value proposition.',
        fixAr: 'ضع الكلمة المفتاحية + فائدة واضحة ومحددة في العنوان.',
        severity: 'critical'
      })
    }
    if (!caption.toLowerCase().match(/offer|now|today|free|save|discount|guarantee|عرض|الآن|اليوم|مجانا|خصم|ضمان/)) {
      score -= 15; warnings.push({
        issue: 'Low Conversion Intent', issueAr: 'ضعف نية التحويل',
        why: 'Missing urgency words reduce ad conversion rate significantly.',
        whyAr: 'غياب كلمات الاستعجال يضعف نسبة التحويل بشكل كبير في الإعلانات.',
        fix: 'Add urgency: "Today only", "Limited offer", "Free consultation".',
        fixAr: 'أضف استعجالاً: "اليوم فقط"، "عرض محدود"، "استشارة مجانية".',
        severity: 'critical'
      })
    }
    if (!cta) {
      score -= 25; warnings.push({
        issue: 'Missing CTA', issueAr: 'دعوة للتصرف مفقودة',
        why: 'Ads without a CTA fail to convert — this is the most critical element.',
        whyAr: 'الإعلان بدون CTA لا يحقق تحويلاً. هذا أهم عنصر في الإعلان المدفوع.',
        fix: 'Add: "Get Quote", "Book Now", "Start Free Trial".',
        fixAr: 'أضف: "احصل على عرض"، "احجز الآن"، "ابدأ مجاناً".',
        severity: 'critical'
      })
    }
  }

  return { score: Math.max(35, score), warnings }
}

// ─── Clip Recommendation Engine ───────────────────────────────────────────────
const CLIP_STYLES: Record<Platform, { ar: { name: string; desc: string; why: string }[]; en: { name: string; desc: string; why: string }[] }> = {
  tiktok: {
    ar: [
      { name: 'Talking Head مباشر', desc: 'تحدث للكاميرا مباشرة بعيون واثقة. اقطع كل 2-3 ثوان.', why: 'يبني ثقة ومصداقية فورية. الخوارزمية تكافئ High watch time.' },
      { name: 'Text on Screen + Voiceover', desc: 'نص يظهر على الشاشة مع صوت الراوي. يُستهلك بصمت.', why: 'أداء عالٍ مع جمهور يشاهد بدون صوت في الأماكن العامة.' },
      { name: 'Before / After', desc: 'قبل وبعد بصري سريع ومباشر.', why: 'أحد أقوى أنواع المحتوى في تيك توك للتفاعل والمشاركة.' },
      { name: 'POV Story', desc: 'ضع المشاهد في موقفك مباشرة.', why: 'إحساس شخصي يزيد completion rate ويحفز التعليق.' },
    ],
    en: [
      { name: 'Direct Talking Head', desc: 'Speak directly to camera with confident eye contact. Cut every 2-3 secs.', why: 'Builds instant trust. Algorithm rewards sustained watch time.' },
      { name: 'Text on Screen + Voiceover', desc: 'On-screen text with narration. Consumable silently.', why: 'High performance for silent viewers in public spaces.' },
      { name: 'Before / After', desc: 'Quick visual before/after transformation.', why: 'One of TikTok\'s highest-performing formats for engagement and shares.' },
      { name: 'POV Story', desc: 'Place viewer directly inside your perspective.', why: 'Personal framing increases completion rate and comment triggers.' },
    ]
  },
  instagram: {
    ar: [
      { name: 'B-Roll Cinematic + Voiceover', desc: 'لقطات جمالية مع صوت راوي عاطفي.', why: 'أعلى أداء في الريلز بيئياً وإلهامياً.' },
      { name: 'Carousel تعليمي', desc: '7-10 شرائح بمعلومات قيّمة قابلة للحفظ.', why: 'أعلى save rate على الإطلاق في إنستقرام.' },
      { name: 'Transition Reel', desc: 'انتقالات إبداعية مع موسيقى ترند.', why: 'يجذب المشاهدة المتكررة ويشجع المشاركة.' },
      { name: 'Tutorial Breakdown', desc: 'شرح خطوات عملية بنص واضح.', why: 'محتوى عالي القيمة = حفظ مرتفع = وصول أكبر.' },
    ],
    en: [
      { name: 'Cinematic B-Roll + Voiceover', desc: 'Aesthetic footage with emotional narration.', why: 'Highest performance for lifestyle/inspirational Reels.' },
      { name: 'Educational Carousel', desc: '7-10 slides with save-worthy information.', why: 'Highest save rate format on Instagram.' },
      { name: 'Transition Reel', desc: 'Creative transitions synced to trending audio.', why: 'Encourages rewatch and sharing behavior.' },
      { name: 'Tutorial Breakdown', desc: 'Step-by-step practical walkthrough with clear text.', why: 'High-value content = high saves = broader reach.' },
    ]
  },
  snapchat: {
    ar: [
      { name: 'Quick Reaction', desc: 'رد فعل سريع وأصيل في 5-7 ثوان.', why: 'الأصالة والسرعة هما قيم سناب الجوهرية.' },
      { name: 'Behind the Scenes', desc: 'كواليس حقيقية وغير مصطنعة.', why: 'جمهور سناب يقدّر المحتوى غير الرسمي.' },
    ],
    en: [
      { name: 'Quick Reaction', desc: 'Fast authentic reaction in 5-7 seconds.', why: 'Authenticity and speed are Snapchat\'s core values.' },
      { name: 'Behind the Scenes', desc: 'Raw, unscripted backstage footage.', why: 'Snapchat audience rewards informal, genuine content.' },
    ]
  },
  google_ads: {
    ar: [
      { name: 'Problem → Solution', desc: 'مشكلة (3 ثوان) + حل (5 ثوان) + CTA (2 ثوان).', why: 'الصيغة الأعلى تحويلاً في الإعلانات المدفوعة.' },
      { name: 'Testimonial سريع', desc: 'عميل حقيقي يتحدث بـ 15 ثانية.', why: 'الدليل الاجتماعي يخفض تكلفة الاقتناء CPL.' },
    ],
    en: [
      { name: 'Problem → Solution', desc: 'Problem (3s) + Solution (5s) + CTA (2s).', why: 'Highest-converting formula for paid ad content.' },
      { name: 'Quick Testimonial', desc: 'Real customer speaking in 15 seconds.', why: 'Social proof lowers CPL and improves conversion rate.' },
    ]
  }
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ExecStatus }) {
  const map: Record<ExecStatus, { icon: React.ReactNode; label: string; cls: string }> = {
    queued:    { icon: <Clock className="h-3 w-3" />,                     label: 'Queued',    cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30' },
    running:   { icon: <Loader2 className="h-3 w-3 animate-spin" />,     label: 'Running',   cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
    completed: { icon: <CheckCircle2 className="h-3 w-3" />,             label: 'Done',      cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    failed:    { icon: <XCircle className="h-3 w-3" />,                   label: 'Failed',    cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    blocked:   { icon: <Lock className="h-3 w-3" />,                      label: 'Blocked',   cls: 'bg-amber-500/20 text-amber-400 border-amber-500/30' },
  }
  const { icon, label, cls } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      {icon}{label}
    </span>
  )
}

// ─── Client Account Info Panel ─────────────────────────────────────────────────
function ClientAccountPanel({
  clientId, platform, socialAccounts, lang, onAccountChange
}: {
  clientId: string; platform: Platform; socialAccounts: any[]; lang: string; onAccountChange: (id: string) => void
}) {
  const clientAccs = socialAccounts.filter(a => a.client_id === clientId && (a.platform === platform || a.platform === 'all'))
  const [editId, setEditId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [showPass, setShowPass] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  const [form, setForm] = useState({ account_name: '', username: '', email: '', password: '', is_default: 'false', notes: '' })

  const isAr = lang === 'ar'

  const handleSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    try {
      const fd = new FormData(e.currentTarget)
      fd.set('client_id', clientId)
      fd.set('platform', platform)
      if (editId) { await updateSocialAccount(editId, fd) } else { await addSocialAccount(fd) }
      setMsg(isAr ? '✅ تم الحفظ بنجاح' : '✅ Saved successfully')
      setShowAdd(false); setEditId(null)
    } catch {
      setMsg(isAr ? '❌ فشل الحفظ' : '❌ Save failed')
    } finally { setSaving(false); setTimeout(() => setMsg(''), 3000) }
  }

  if (clientAccs.length === 0 && !showAdd) {
    return (
      <div className="border border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-4 flex flex-col items-center gap-2 text-center">
        <Shield className="h-6 w-6 text-purple-400 opacity-50" />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{isAr ? 'لا يوجد حساب مرتبط لهذا العميل' : 'No social account linked for this client'}</p>
        <button onClick={() => setShowAdd(true)} className="btn btn-xs btn-secondary flex items-center gap-1.5">
          <Plus className="h-3 w-3" /> {isAr ? 'ربط حساب' : 'Link Account'}
        </button>
      </div>
    )
  }

  const AccountForm = ({ id }: { id?: string }) => (
    <form onSubmit={handleSave} className="space-y-3 bg-purple-50/50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
      <h4 className="font-bold text-xs uppercase tracking-wider text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
        <Shield className="h-3.5 w-3.5" /> {id ? (isAr ? 'تعديل الحساب' : 'Edit Account') : (isAr ? 'ربط حساب جديد' : 'Link New Account')}
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="form-label text-[10px]">{isAr ? 'اسم الحساب' : 'Account Name'}</label>
          <input name="account_name" className="form-input text-sm" placeholder={isAr ? 'مثال: حساب الإنستقرام الرئيسي' : 'e.g. Main Instagram'} defaultValue={editId ? clientAccs.find(a => a.id === editId)?.account_name : ''} />
        </div>
        <div>
          <label className="form-label text-[10px]">{isAr ? 'اسم المستخدم' : 'Username'}</label>
          <input name="username" className="form-input text-sm" placeholder="@username" defaultValue={editId ? clientAccs.find(a => a.id === editId)?.username : ''} />
        </div>
        <div>
          <label className="form-label text-[10px]">{isAr ? 'البريد الإلكتروني' : 'Email'}</label>
          <input name="email" type="email" className="form-input text-sm" placeholder="account@email.com" defaultValue={editId ? clientAccs.find(a => a.id === editId)?.email : ''} />
        </div>
        <div>
          <label className="form-label text-[10px] flex items-center gap-1"><Key className="h-2.5 w-2.5 text-amber-500" />{isAr ? 'كلمة المرور' : 'Password'}</label>
          <input name="password" type="password" className="form-input text-sm" placeholder={id ? (isAr ? 'اتركه فارغاً للإبقاء' : 'Leave blank to keep') : (isAr ? 'كلمة المرور (مشفّرة)' : 'Password (encrypted)')} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-xs cursor-pointer">
          <input type="checkbox" name="is_default" value="true" className="rounded" defaultChecked={editId ? clientAccs.find(a => a.id === editId)?.is_default : false} />
          {isAr ? 'حساب افتراضي' : 'Set as default'}
        </label>
      </div>
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="btn btn-primary btn-xs flex-1">
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {isAr ? 'حفظ' : 'Save'}
        </button>
        <button type="button" onClick={() => { setShowAdd(false); setEditId(null) }} className="btn btn-secondary btn-xs">
          {isAr ? 'إلغاء' : 'Cancel'}
        </button>
      </div>
      {msg && <p className="text-xs text-center font-bold">{msg}</p>}
    </form>
  )

  return (
    <div className="space-y-2">
      {clientAccs.map(acc => (
        <div key={acc.id} className={`border rounded-xl p-3 transition-all cursor-pointer ${editId === acc.id ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20' : 'border-[hsl(var(--border))] hover:border-purple-300'}`}>
          {editId === acc.id ? <AccountForm id={acc.id} /> : (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">{acc.account_name || acc.username}</p>
                  {acc.is_default && <span className="badge bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 text-[9px] font-bold">Primary</span>}
                </div>
                {acc.username && <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1"><User className="h-3 w-3" /> {acc.username}</p>}
                {acc.email && <p className="text-xs text-[hsl(var(--muted-foreground))] flex items-center gap-1"><Mail className="h-3 w-3" /> {acc.email}</p>}
                <div className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
                  <Key className="h-3 w-3 text-amber-500" />
                  <span>{showPass[acc.id] ? '••••••••' : '🔐 ' + (isAr ? 'محمية ومشفّرة' : 'Encrypted & secured')}</span>
                  <button onClick={() => setShowPass(p => ({ ...p, [acc.id]: !p[acc.id] }))} className="ml-1 text-purple-500 hover:text-purple-700">
                    {showPass[acc.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => onAccountChange(acc.id)} className="btn btn-xs btn-secondary text-[10px]">
                  {isAr ? 'اختر' : 'Select'}
                </button>
                <button onClick={() => setEditId(acc.id)} className="btn btn-xs btn-ghost text-[10px]">
                  <Edit3 className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      {showAdd && !editId && <AccountForm />}
      {!showAdd && !editId && (
        <button onClick={() => setShowAdd(true)} className="w-full border border-dashed border-purple-300 dark:border-purple-700 rounded-xl p-2 text-xs text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-all flex items-center justify-center gap-1.5">
          <Plus className="h-3 w-3" /> {isAr ? 'ربط حساب إضافي' : 'Link Another Account'}
        </button>
      )}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function SocialContentCreator({ platform, clients, teamMembers, socialAccounts = [] }: Props) {
  const { t, language } = useLanguage()
  const lang = language || 'en'
  const isAr = lang === 'ar'
  const L = (ar: string, en: string) => isAr ? ar : en

  // Content fields
  const [hook, setHook]         = useState('')
  const [title, setTitle]       = useState('')
  const [caption, setCaption]   = useState('')
  const [hashtags, setHashtags] = useState('')
  const [firstComment, setFirstComment] = useState('')
  const [cta, setCta]           = useState('')

  // Brief — structured
  const [briefOpen, setBriefOpen]       = useState(true)
  const [briefDesc, setBriefDesc]       = useState('')
  const [briefProduct, setBriefProduct] = useState('')
  const [briefAudience, setBriefAudience] = useState('')
  const [briefGoal, setBriefGoal]       = useState('')
  const [briefTone, setBriefTone]       = useState('')
  const [briefOffer, setBriefOffer]     = useState('')
  const [briefCtaDir, setBriefCtaDir]   = useState('')
  const brief = [briefDesc, briefProduct, briefAudience, briefGoal, briefTone, briefOffer].filter(Boolean).join(' | ')

  // Routing
  const [publishDate, setPublishDate] = useState('')
  const [publishTime, setPublishTime] = useState('')
  const [clientId, setClientId]       = useState('')
  const [assigneeId, setAssigneeId]   = useState('')
  const [accountId, setAccountId]     = useState('')

  // Auto-select social account
  useEffect(() => {
    if (clientId && socialAccounts.length > 0) {
      const accs = socialAccounts.filter(a => a.client_id === clientId)
      const def  = accs.find(a => a.is_default) || accs[0]
      setAccountId(def?.id || '')
    } else setAccountId('')
  }, [clientId, socialAccounts])

  // UI state
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [showLog, setShowLog]       = useState(false)
  const [showAccounts, setShowAccounts] = useState(false)
  const [showClips, setShowClips]   = useState(false)
  const [activeClip, setActiveClip] = useState(0)
  const [execLogs, setExecLogs]     = useState<ExecLog[]>([])
  const logRef = useRef<HTMLDivElement>(null)

  // Media
  const [mediaFile, setMediaFile]               = useState<File | null>(null)
  const [mediaPreview, setMediaPreview]         = useState('')
  const [processingState, setProcessingState]   = useState<ProcessingProgress | null>(null)
  const [videoMetadata, setVideoMetadata]       = useState<VideoMetadata | null>(null)
  const [optimizedFile, setOptimizedFile]       = useState<File | null>(null)
  const [previewFile, setPreviewFile]           = useState<File | null>(null)
  const [thumbnailBlob, setThumbnailBlob]       = useState<Blob | null>(null)

  // AI cache
  const [suggestionCache, setSuggestionCache] = useState<{ [k: string]: string[] }>({})
  const [suggestionIdx,   setSuggestionIdx]   = useState<{ [k: string]: number }>({})

  // OpenClaw
  const { context, updateContext } = useOpenClaw()

  useEffect(() => {
    updateContext({ contentDraft: { hook, caption, hashtags, cta, title, firstComment }, clientName: clients.find(c => c.id === clientId)?.company_name })
  }, [hook, caption, hashtags, cta, title, firstComment, clientId])

  useEffect(() => {
    if (context.actionPayload?.type === 'apply_draft') {
      const d = context.actionPayload.data
      if (d.hook)     { setHook(d.hook); setTitle(d.hook) }
      if (d.caption)  setCaption(d.caption)
      if (d.hashtags) setHashtags(d.hashtags)
      if (d.first_comment) setFirstComment(d.first_comment)
      if (d.cta)      setCta(d.cta)
      setSuggestionCache({})
    }
  }, [context.actionPayload])

  useEffect(() => { if (showLog) logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' }) }, [execLogs, showLog])

  // ── Exec Logging ────────────────────────────────────────────────────────
  const logStart = (action: string): string => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    setExecLogs(prev => [...prev, { id, action, status: 'queued', timestamp: new Date().toISOString() }])
    setTimeout(() => setExecLogs(prev => prev.map(l => l.id === id ? { ...l, status: 'running' } : l)), 80)
    return id
  }
  const logDone  = (id: string, output: string, fields?: string[]) => setExecLogs(prev => prev.map(l => l.id === id ? { ...l, status: 'completed', output, fields } : l))
  const logFail  = (id: string, error: string)  => setExecLogs(prev => prev.map(l => l.id === id ? { ...l, status: 'failed',  error } : l))
  const logBlock = (id: string, error: string)  => setExecLogs(prev => prev.map(l => l.id === id ? { ...l, status: 'blocked', error } : l))

  // ── Media ────────────────────────────────────────────────────────────────
  const handleMediaChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return
    setMediaFile(file)
    if (file.type.startsWith('video/')) {
      setProcessingState({ status: 'analyzing' as any, progress: 0, message: L('جاري التحليل...', 'Analyzing...') })
      try {
        const meta = await extractMetadata(file); setVideoMetadata(meta)
        const thumb = await generateThumbnail(file, 2); setThumbnailBlob(thumb)
        setMediaPreview(URL.createObjectURL(thumb))
        const result = await processVideo(file, platform, prog => setProcessingState(prog))
        setOptimizedFile(result.optimized); setPreviewFile(result.preview)
        setMediaPreview(URL.createObjectURL(result.preview))
        setTimeout(() => setProcessingState(null), 2000)
      } catch (err: any) {
        setProcessingState({ status: 'error', progress: 0, message: err.message })
        setMediaPreview(URL.createObjectURL(file))
      }
    } else setMediaPreview(URL.createObjectURL(file))
  }

  // ── AI Field Suggestions ─────────────────────────────────────────────────
  const fetchSuggestion = async (field: 'hook' | 'caption' | 'hashtags' | 'cta' | 'first_comment') => {
    setGenerating(true)
    const logId = logStart(L(`اقتراح ${field}`, `AI Suggest: ${field}`))
    try {
      if (suggestionCache[field]?.length > 0) {
        const idx = ((suggestionIdx[field] || 0) + 1) % suggestionCache[field].length
        setSuggestionIdx(prev => ({ ...prev, [field]: idx }))
        applySuggestion(field, suggestionCache[field][idx])
        logDone(logId, L('تم التطبيق', 'Applied'))
        return
      }
      const res = await fetch('/api/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, field, lang, topic: brief || caption || title, currentContext: brief })
      })
      if (res.ok) {
        const { suggestions } = await res.json()
        if (suggestions?.length > 0) {
          setSuggestionCache(prev => ({ ...prev, [field]: suggestions }))
          setSuggestionIdx(prev => ({ ...prev, [field]: 0 }))
          applySuggestion(field, suggestions[0])
          logDone(logId, suggestions[0].slice(0, 60) + '...', [field])
        }
      } else { logFail(logId, L('فشل الاقتراح', 'Suggestion failed')) }
    } catch (err: any) { logFail(logId, err.message) }
    finally { setGenerating(false) }
  }

  const applySuggestion = (field: string, text: string) => {
    if (field === 'hook')     { setHook(text); setTitle(text) }
    if (field === 'caption')  setCaption(text)
    if (field === 'hashtags') setHashtags(text)
    if (field === 'first_comment') setFirstComment(text)
    if (field === 'cta')      setCta(text)
  }

  // ── OpenClaw Action Executor ─────────────────────────────────────────────
  const ACTION_LABELS: Record<string, { en: string; ar: string }> = {
    generate: { en: 'Draft Full Content', ar: 'توليد محتوى كامل' },
    viral:    { en: 'Make Viral',         ar: 'جعله فيروسياً' },
    premium:  { en: 'Premium Tone',       ar: 'نبرة راقية' },
    convert:  { en: 'Conversion Mode',    ar: 'وضع التحويل' },
    fix:      { en: 'Auto-Fix All Issues', ar: 'إصلاح تلقائي شامل' },
  }

  const TONE_MAP: Record<string, string> = {
    generate: 'professional and complete',
    viral:    'viral, high-energy, scroll-stopping — use pattern interrupts and powerful openings',
    premium:  'luxury, premium, exclusive — aspirational brand voice for high-end clients',
    convert:  'high-converting direct response — urgency, social proof, clear CTA',
    fix:      'corrected and optimized for maximum platform performance',
  }

  const executeOpenClawAction = async (action: string) => {
    if (action === 'generate' && !brief) {
      alert(L('أدخل تفاصيل الحملة أولاً', 'Please fill in the campaign brief first.'))
      return
    }
    const label = ACTION_LABELS[action]
    const logId = logStart(isAr ? label.ar : label.en)
    setGenerating(true); setShowLog(true)

    try {
      const res = await fetch('/api/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_content',
          payload: {
            platform, lang,
            topic: brief || caption || title || 'Agency Campaign',
            tone: TONE_MAP[action] || action,
            audience: briefAudience,
            goal: briefGoal,
            offer: briefOffer,
            ctaDirection: briefCtaDir,
            existing: { hook, caption, hashtags, cta, title,
              warnings: action === 'fix' ? calculateScore(caption, hook, hashtags, platform, title, cta, lang).warnings : []
            }
          }
        })
      })
      const json = await res.json()
      if (!res.ok || !json.success) { logFail(logId, json.error || `HTTP ${res.status}`); return }
      if (json.requiresApproval)    { logBlock(logId, L('يتطلب موافقة', 'Requires approval')); return }

      const data = json.data
      const applied: string[] = []
      if (data?.title)    { setTitle(data.title);   applied.push('title') }
      if (data?.hook)     { setHook(data.hook);     applied.push('hook') }
      if (data?.caption)  { setCaption(data.caption); applied.push('caption') }
      if (data?.hashtags) { setHashtags(data.hashtags); applied.push('hashtags') }
      if (data?.first_comment) { setFirstComment(data.first_comment); applied.push('first_comment') }
      if (data?.cta)      { setCta(data.cta);       applied.push('cta') }
      setSuggestionCache({})
      logDone(logId, L(`طُبّق على: ${applied.join(', ')}`, `Applied to: ${applied.join(', ')}`), applied)
    } catch (err: any) { logFail(logId, err.message || L('خطأ في الشبكة', 'Network error')) }
    finally { setGenerating(false) }
  }

  // ── Save / Schedule ──────────────────────────────────────────────────────
  const handleSave = async (type: 'draft' | 'save' | 'schedule') => {
    if (type === 'schedule' && (!publishDate || !publishTime)) {
      return alert(L('حدد التاريخ والوقت أولاً', 'Please select a date and time first.'))
    }
    setSaving(true)
    const logId = logStart(L(type === 'schedule' ? 'جدولة المحتوى' : 'حفظ المسودة', type === 'schedule' ? 'Schedule Content' : 'Save Draft'))
    const fullCaption = `${hook ? hook + '\n\n' : ''}${caption}\n\n${cta}${firstComment ? '\n\n[First Comment]\n' + firstComment : ''}`
    try {
      let mediaUrl = ''
      if (mediaFile) {
        const ext = mediaFile.name.split('.').pop()
        const rnd = Math.random().toString(36).substring(2)
        const base = clientId || 'unassigned'
        const up = async (f: File | Blob, path: string) => {
          const { data } = await supabaseBrowserClient.storage.from('agency-files').upload(path, f)
          return data ? supabaseBrowserClient.storage.from('agency-files').getPublicUrl(path).data.publicUrl : ''
        }
        if (optimizedFile && previewFile && thumbnailBlob) {
          await up(mediaFile, `clients/${base}/videos/original/${rnd}.${ext}`)
          mediaUrl = await up(optimizedFile, `clients/${base}/videos/optimized/${rnd}.mp4`)
          await up(previewFile, `clients/${base}/videos/preview/${rnd}.mp4`)
          await up(thumbnailBlob, `clients/${base}/thumbnails/${rnd}.jpg`)
        } else { mediaUrl = await up(mediaFile, `clients/${base}/images/${rnd}.${ext}`) }
      }
      await fetch('/api/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform, title, caption: fullCaption, hashtags,
          publish_date: publishDate, publish_time: publishTime, timezone: 'Asia/Riyadh',
          schedule_status: type === 'draft' ? 'draft' : type === 'schedule' ? 'scheduled' : 'ready',
          client_id: clientId, assignee_id: assigneeId, account_id: accountId,
          content_type: 'post', task_status: 'not_started', media_url: mediaUrl
        })
      })
      setSaved(true)
      logDone(logId, L('تم الحفظ بنجاح', 'Saved successfully'))
      setTimeout(() => setSaved(false), 3000)
    } catch (err: any) { logFail(logId, err.message) }
    finally { setSaving(false) }
  }

  const { score, warnings } = calculateScore(caption, hook, hashtags, platform, title, cta, lang)
  const runningCount = execLogs.filter(l => l.status === 'running').length
  const failedCount  = execLogs.filter(l => l.status === 'failed').length
  const clips        = CLIP_STYLES[platform]?.[isAr ? 'ar' : 'en'] || []
  const selectedClient = clients.find(c => c.id === clientId)

  const PLATFORM_COLORS: Record<Platform, string> = {
    instagram: 'from-pink-500 to-orange-500',
    tiktok:    'from-gray-900 to-pink-600',
    snapchat:  'from-yellow-400 to-yellow-500',
    google_ads:'from-blue-500 to-red-500',
  }

  // ─────────────────────── RENDER ──────────────────────────────────────────
  return (
    <div className="grid gap-6 xl:grid-cols-2 min-h-[90vh]" dir={isAr ? 'rtl' : 'ltr'}>

      {/* ── LEFT — Content Editor ── */}
      <div className="flex flex-col gap-5">

        {/* Client Selector + Account Info */}
        <div className="premium-card p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className={`h-8 w-8 rounded-lg bg-gradient-to-br ${PLATFORM_COLORS[platform]} flex items-center justify-center`}>
              <User className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">{L('العميل والحساب', 'Client & Account')}</h3>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{L('اختر العميل وربط حسابه', 'Select client and link social account')}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="form-label text-[10px]">{L('العميل', 'Client')}</label>
              <select className="form-input font-bold text-sm" value={clientId} onChange={e => setClientId(e.target.value)}>
                <option value="">{L('اختر عميلاً...', 'Select client...')}</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className="form-label text-[10px]">{L('المسؤول', 'Assignee')}</label>
              <select className="form-input text-sm" value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
                <option value="">{L('اختر...', 'Select...')}</option>
                {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
              </select>
            </div>
          </div>

          {clientId && (
            <div className="border-t border-[hsl(var(--border))] pt-3">
              <button onClick={() => setShowAccounts(!showAccounts)} className="flex items-center gap-2 text-xs font-bold text-purple-600 dark:text-purple-400 hover:text-purple-800 transition-colors w-full justify-between">
                <span className="flex items-center gap-1.5"><Shield className="h-3.5 w-3.5" /> {L('حسابات السوشيال ميديا الآمنة', 'Secure Social Accounts')}</span>
                {showAccounts ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              {showAccounts && (
                <div className="mt-3">
                  <ClientAccountPanel
                    clientId={clientId} platform={platform}
                    socialAccounts={socialAccounts} lang={lang}
                    onAccountChange={setAccountId}
                  />
                </div>
              )}
              {accountId && !showAccounts && (
                <div className="mt-2 text-xs flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3 w-3" />
                  {L('الحساب المرتبط:', 'Linked account:')} <strong>{socialAccounts.find(a => a.id === accountId)?.username || accountId.slice(0, 8)}</strong>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Content Editor */}
        <div className="premium-card p-6 flex flex-col gap-4">
          <div className="flex items-center justify-between border-b border-[hsl(var(--border))] pb-3">
            <h3 className="font-bold text-lg flex items-center gap-2">
              <Type className="h-5 w-5 text-[hsl(var(--primary))]" /> {L('محرر المحتوى', 'Content Editor')}
            </h3>
            <span className={`badge ${score > 80 ? 'badge-success' : score > 60 ? 'badge-warning' : 'badge-danger'} px-3 py-1 text-xs font-bold`}>
              {L('النتيجة:', 'Score:')} {score}/100
            </span>
          </div>

          {/* Hook */}
          <div className="form-group">
            <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center justify-between">
              <span>{L('الهوك / العنوان', 'Hook / Headline')}</span>
              <button onClick={() => fetchSuggestion('hook')} disabled={generating} className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50 transition-colors">
                <Wand2 className="h-3 w-3" /> {L('اقتراح ذكي', 'AI Suggest')}
              </button>
            </label>
            <input className="form-input text-base font-bold" value={hook || title}
              onChange={e => { setHook(e.target.value); setTitle(e.target.value) }}
              placeholder={L(
                platform === 'tiktok' ? 'POV: اكتشفت الحقيقة عن...' : 'اكتب هوكاً يوقف التمرير...',
                platform === 'tiktok' ? 'POV: You just unlocked the truth about...' : 'Grab attention instantly...'
              )} />
          </div>

          {/* Caption */}
          <div className="form-group flex-1">
            <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center justify-between">
              <span>{L('نص المحتوى / السكريبت', 'Body Copy / Script')}</span>
              <button onClick={() => fetchSuggestion('caption')} disabled={generating} className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50">
                <Wand2 className="h-3 w-3" /> {L('توسيع الكابشن', 'Expand Copy')}
              </button>
            </label>
            <textarea className="form-input min-h-[180px] resize-none leading-relaxed" value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder={L('الكابشن أو نص السكريبت يبدأ هنا...', 'Main content goes here...')} />
          </div>

          {/* CTA + Hashtags */}
          <div className="grid grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center justify-between">
                <span>{L('دعوة للتصرف', 'Call to Action')}</span>
                <button onClick={() => fetchSuggestion('cta')} disabled={generating} className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50">
                  <Wand2 className="h-3 w-3" /> {L('توليد', 'Generate')}
                </button>
              </label>
              <input className="form-input text-sm" value={cta} onChange={e => setCta(e.target.value)}
                placeholder={L('مثال: رابط البايو', 'e.g. Link in bio')} />
            </div>
            <div className="form-group">
              <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center justify-between">
                <span>{platform === 'google_ads' ? L('الكلمات المفتاحية', 'Keywords') : L('الهاشتاقات', 'Hashtags')}</span>
                <button onClick={() => fetchSuggestion('hashtags')} disabled={generating} className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50">
                  <Hash className="h-3 w-3" /> {L('اقتراح', 'Smart Tags')}
                </button>
              </label>
              <input className="form-input text-sm text-[hsl(var(--primary))]" value={hashtags}
                onChange={e => setHashtags(e.target.value)} placeholder={platform === 'google_ads' ? L('تسويق | مطاعم | نمو', 'marketing | growth') : '#marketing #viral'} />
            </div>
          </div>
          
          {/* First Comment (Instagram) */}
          {platform === 'instagram' && (
            <div className="form-group mt-4">
              <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center justify-between">
                <span>{L('التعليق الأول (اختياري)', 'First Comment (Optional)')}</span>
                <button onClick={() => fetchSuggestion('first_comment')} disabled={generating} className="text-purple-500 hover:text-purple-600 flex items-center gap-1 text-[10px] font-bold disabled:opacity-50">
                  <Wand2 className="h-3 w-3" /> {L('توليد', 'Generate')}
                </button>
              </label>
              <textarea className="form-input text-sm text-[hsl(var(--primary))] min-h-[60px] resize-none" value={firstComment}
                onChange={e => setFirstComment(e.target.value)} placeholder={L('يستخدم عادة لوضع الهاشتاقات أو الروابط...', 'Typically used for hashtags to keep caption clean...')} />
            </div>
          )}

          {/* Media Upload */}
          <div className="form-group pt-2 border-t border-[hsl(var(--border))]">
            <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))] font-bold flex items-center justify-between">
              <span>{L('رفع الميديا', 'Media Upload')}</span>
              {mediaFile && <button onClick={() => { setMediaFile(null); setMediaPreview(''); setOptimizedFile(null); setThumbnailBlob(null) }} className="text-red-500 hover:text-red-600 font-bold text-xs">✕ {L('إزالة', 'Remove')}</button>}
            </label>
            {!mediaFile ? (
              <div className="border-2 border-dashed border-[hsl(var(--border))] rounded-xl p-6 flex flex-col justify-center items-center cursor-pointer hover:border-purple-500 hover:bg-purple-500/5 transition-all text-center"
                onClick={() => document.getElementById('media-upload')?.click()}>
                <Upload className="h-8 w-8 opacity-30 mb-2" />
                <p className="font-bold text-sm">{L('رفع ومعالجة الميديا', 'Upload & Process Media')}</p>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1">FFmpeg WASM — {L('ضغط وتحسين تلقائي', 'Auto compress & optimize')}</p>
                <input type="file" id="media-upload" accept="video/mp4,video/quicktime,image/jpeg,image/png" className="hidden" onChange={handleMediaChange} />
              </div>
            ) : processingState ? (
              <div className="border border-blue-200 bg-blue-50/50 dark:border-blue-900/30 dark:bg-blue-900/10 rounded-xl p-5 flex flex-col items-center text-center">
                <RefreshCw className={`h-7 w-7 text-blue-500 mb-2 ${processingState.status !== 'error' ? 'animate-spin' : ''}`} />
                <p className="text-xs text-blue-700 dark:text-blue-400">{processingState.message}</p>
                <div className="w-full bg-blue-200 dark:bg-blue-900/40 rounded-full h-1.5 mt-3 overflow-hidden">
                  <div className="bg-blue-600 h-1.5 rounded-full transition-all duration-300" style={{ width: `${processingState.progress}%` }} />
                </div>
              </div>
            ) : (
              <div className="relative rounded-xl overflow-hidden border-2 border-purple-500/30 bg-black aspect-video flex items-center justify-center group h-[200px]">
                {mediaFile.type.startsWith('video/') ? <video src={mediaPreview} className="w-full h-full object-contain" autoPlay loop muted playsInline /> : <img src={mediaPreview} className="w-full h-full object-cover" alt="Preview" />}
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <button onClick={() => document.getElementById('media-upload')?.click()} className="btn btn-primary btn-sm shadow-xl">{L('استبدال', 'Replace')}</button>
                </div>
                <input type="file" id="media-upload" accept="video/mp4,video/quicktime,image/jpeg,image/png" className="hidden" onChange={handleMediaChange} />
              </div>
            )}
          </div>
        </div>

        {/* Scheduling */}
        <div className="premium-card p-5">
          <h3 className="font-bold text-sm mb-4 uppercase tracking-wider text-[hsl(var(--muted-foreground))] flex items-center gap-2">
            <ArrowRight className="h-4 w-4" /> {L('الجدولة والنشر', 'Schedule & Publish')}
          </h3>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div>
              <label className="form-label text-[10px]">{L('تاريخ النشر', 'Publish Date')}</label>
              <input type="date" className="form-input" value={publishDate} onChange={e => setPublishDate(e.target.value)} />
            </div>
            <div>
              <label className="form-label text-[10px]">{L('الوقت', 'Time')}</label>
              <div className="flex gap-2">
                <input type="time" className="form-input flex-1" value={publishTime} onChange={e => setPublishTime(e.target.value)} />
                <select className="form-input w-auto px-2 text-xs">
                  <option value="Asia/Riyadh">KSA +3</option>
                  <option value="Asia/Dubai">UAE +4</option>
                  <option value="UTC">UTC</option>
                  <option value="Europe/London">GMT</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={() => handleSave('draft')} disabled={saving} className="btn btn-secondary flex-1 font-bold">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {L('حفظ مسودة', 'Save Draft')}
            </button>
            <button onClick={() => handleSave('schedule')} disabled={saving || !publishDate || !publishTime} className="btn btn-primary flex-1 font-bold shadow-lg">
              {saved ? <><CheckCircle2 className="h-4 w-4" /> {L('تمت الجدولة ✅', 'Scheduled ✅')}</> : <>{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {L('جدولة المحتوى', 'Schedule Content')}</>}
            </button>
          </div>
        </div>
      </div>

      {/* ── RIGHT — OpenClaw Intelligence ── */}
      <div className="flex flex-col gap-5">

        {/* Campaign Brief — Structured */}
        <div className="premium-card p-5 bg-gradient-to-br from-indigo-50/30 to-purple-50/30 dark:from-indigo-950/20 dark:to-purple-950/20 border border-purple-200 dark:border-purple-800/50">
          <button onClick={() => setBriefOpen(!briefOpen)} className="w-full flex items-center justify-between mb-1">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" /> {L('بريف الحملة', 'Campaign Brief')}
              <span className="text-[10px] bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-2 py-0.5 rounded-full font-bold uppercase">{L('مطلوب', 'Required')}</span>
            </h3>
            {briefOpen ? <ChevronDown className="h-4 w-4 text-[hsl(var(--muted-foreground))]" /> : <ChevronRight className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />}
          </button>
          {briefOpen && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="col-span-2">
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('وصف الحملة / الموضوع', 'Campaign Description / Topic')} *</label>
                <textarea className="form-input border-purple-200 dark:border-purple-800/50" rows={2}
                  placeholder={L('اشرح الحملة والرسالة الرئيسية...', 'Describe the campaign and main message...')}
                  value={briefDesc} onChange={e => setBriefDesc(e.target.value)} />
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('المنتج / الخدمة', 'Product / Service')}</label>
                <input className="form-input border-purple-200 dark:border-purple-800/50 text-sm" placeholder={L('ما الذي نروّج له؟', 'What are we promoting?')} value={briefProduct} onChange={e => setBriefProduct(e.target.value)} />
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('الجمهور المستهدف', 'Target Audience')}</label>
                <input className="form-input border-purple-200 dark:border-purple-800/50 text-sm" placeholder={L('من هو جمهورنا؟', 'Who is our audience?')} value={briefAudience} onChange={e => setBriefAudience(e.target.value)} />
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('هدف الحملة', 'Campaign Goal')}</label>
                <select className="form-input border-purple-200 dark:border-purple-800/50 text-sm" value={briefGoal} onChange={e => setBriefGoal(e.target.value)}>
                  <option value="">{L('اختر الهدف...', 'Select goal...')}</option>
                  <option value="awareness">{L('الوعي بالعلامة', 'Brand Awareness')}</option>
                  <option value="engagement">{L('التفاعل', 'Engagement')}</option>
                  <option value="leads">{L('استقطاب العملاء', 'Lead Generation')}</option>
                  <option value="sales">{L('المبيعات المباشرة', 'Direct Sales')}</option>
                  <option value="followers">{L('زيادة المتابعين', 'Grow Followers')}</option>
                </select>
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('نبرة المحتوى', 'Content Tone')}</label>
                <select className="form-input border-purple-200 dark:border-purple-800/50 text-sm" value={briefTone} onChange={e => setBriefTone(e.target.value)}>
                  <option value="">{L('اختر النبرة...', 'Select tone...')}</option>
                  <option value="professional">{L('احترافي', 'Professional')}</option>
                  <option value="viral">{L('فيروسي / ترفيهي', 'Viral / Entertaining')}</option>
                  <option value="premium">{L('راقي / فخم', 'Premium / Luxury')}</option>
                  <option value="emotional">{L('عاطفي / ملهم', 'Emotional / Inspiring')}</option>
                  <option value="direct">{L('مباشر / تحويلي', 'Direct / Conversion')}</option>
                </select>
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('العرض / الميزة الحصرية', 'Offer / USP')}</label>
                <input className="form-input border-purple-200 dark:border-purple-800/50 text-sm" placeholder={L('ما الذي يميزنا؟', 'What makes us unique?')} value={briefOffer} onChange={e => setBriefOffer(e.target.value)} />
              </div>
              <div>
                <label className="form-label text-[10px] text-purple-700 dark:text-purple-400">{L('اتجاه الـ CTA', 'CTA Direction')}</label>
                <input className="form-input border-purple-200 dark:border-purple-800/50 text-sm" placeholder={L('رابط بايو، DM، واتساب...', 'Bio link, DM, WhatsApp...')} value={briefCtaDir} onChange={e => setBriefCtaDir(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* OpenClaw Action Panel */}
        <div className="premium-card p-5 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-purple-200 dark:border-purple-800/50">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              <h3 className="font-bold text-lg text-purple-900 dark:text-purple-300">OpenClaw</h3>
              <span className="text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider">{L('خبير', 'Expert')}</span>
            </div>
            <button onClick={() => setShowLog(!showLog)}
              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${runningCount > 0 || failedCount > 0 ? 'text-amber-500' : 'text-purple-600 dark:text-purple-400 hover:text-purple-800'}`}>
              <Terminal className="h-3.5 w-3.5" />
              {L('سجل التنفيذ', 'Exec Log')}
              {(runningCount > 0 || failedCount > 0) && (
                <span className={`ml-1 px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold ${failedCount > 0 ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`}>
                  {runningCount > 0 ? runningCount : failedCount}
                </span>
              )}
            </button>
          </div>

          {/* Permission Strip */}
          <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-purple-900/10 dark:bg-purple-900/30 rounded-lg border border-purple-200/50 dark:border-purple-700/30">
            <Lock className="h-3 w-3 text-purple-500 flex-shrink-0" />
            <span className="text-[10px] text-purple-700 dark:text-purple-400 font-medium">
              {L('وضع: توليد المحتوى · التعديلات تتطلب موافقة', 'Mode: generate_content · write operations require approval')}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {([
              { key: 'generate', Icon: Zap,      ar: 'توليد كامل', en: 'Draft Full',    primary: true  },
              { key: 'viral',    Icon: Activity,  ar: 'فيروسي',     en: 'Make Viral',   primary: false },
              { key: 'premium',  Icon: Star,      ar: 'نبرة راقية', en: 'Premium Tone', primary: false },
              { key: 'convert',  Icon: Target,    ar: 'تحويل',       en: 'Conversion',   primary: false },
            ] as { key: string; Icon: React.ComponentType<{ className?: string }>; ar: string; en: string; primary: boolean }[]).map(btn => (
              <button key={btn.key}
                onClick={() => executeOpenClawAction(btn.key)}
                disabled={generating}
                className={`btn ${
                  btn.primary
                    ? 'bg-purple-600 hover:bg-purple-700 text-white border-purple-500 shadow-md'
                    : 'bg-[hsl(var(--card))] border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/40'
                } p-2.5 h-auto flex-col text-xs font-bold disabled:opacity-60 gap-1 transition-all`}
              >
                <span className="flex items-center justify-center h-4 w-4">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <btn.Icon className="h-4 w-4" />}
                </span>
                <span>{isAr ? btn.ar : btn.en}</span>
              </button>
            ))}
          </div>

          {/* Execution Log */}
          {showLog && (
            <div className="mb-4 rounded-xl border border-purple-200 dark:border-purple-800/50 overflow-hidden">
              <div className="bg-gray-900 text-green-400 px-4 py-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                  <Terminal className="h-3 w-3" /> {L('سجل تنفيذ OpenClaw', 'OpenClaw Execution Log')}
                </span>
                <button onClick={() => setExecLogs([])} className="text-gray-500 hover:text-red-400 text-[10px] font-bold">{L('مسح', 'Clear')}</button>
              </div>
              <div ref={logRef} className="bg-gray-950 max-h-[160px] overflow-y-auto p-3 space-y-2 font-mono text-xs">
                {execLogs.length === 0 && <p className="text-gray-600 text-center py-3">{L('لا توجد عمليات حتى الآن', 'No actions executed yet.')}</p>}
                {execLogs.map(log => (
                  <div key={log.id} className="flex items-start gap-2 border-b border-gray-800 pb-2 last:border-0">
                    <StatusBadge status={log.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-300 font-semibold truncate">{log.action}</p>
                      {log.output && <p className="text-green-400/80 text-[9px] truncate">→ {log.output}</p>}
                      {log.fields && <p className="text-blue-400/80 text-[9px]">📝 {log.fields.join(', ')}</p>}
                      {log.error  && <p className="text-red-400/80 text-[9px] truncate">✗ {log.error}</p>}
                    </div>
                    <span className="text-gray-600 text-[9px] whitespace-nowrap">{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Analysis Warnings Panel */}
          {warnings.length > 0 && (
            <div className="p-4 rounded-xl border border-red-200 bg-red-50 dark:border-red-900/40 dark:bg-red-900/10 space-y-3">
              <div className="flex items-center gap-2 text-red-800 dark:text-red-400 font-bold text-xs uppercase tracking-wider border-b border-red-200 dark:border-red-800/50 pb-2">
                <AlertTriangle className="h-4 w-4" />
                {L(`اكتُشف ${warnings.length} مشكلة في الأداء`, `${warnings.length} Algorithm Friction${warnings.length > 1 ? 's' : ''} Detected`)}
              </div>
              <div className="space-y-3">
                {warnings.map((w, i) => (
                  <div key={i} className="space-y-1">
                    <p className="text-sm font-bold text-red-900 dark:text-red-300 flex items-center gap-1.5">
                      <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${w.severity === 'critical' ? 'bg-red-500' : 'bg-amber-400'}`} />
                      {isAr ? w.issueAr : w.issue}
                    </p>
                    <p className="text-xs text-red-700 dark:text-red-400 leading-relaxed">{isAr ? w.whyAr : w.why}</p>
                    <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">💡 {isAr ? w.fixAr : w.fix}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={() => executeOpenClawAction('fix')}
                disabled={generating}
                className="w-full text-xs font-bold text-center text-white bg-red-600 dark:bg-red-700 p-2.5 rounded-lg hover:bg-red-700 transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-60"
              >
                <span className="flex items-center justify-center h-3 w-3">
                  {generating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Award className="h-3 w-3" />}
                </span>
                <span>{L('إصلاح تلقائي شامل بـ OpenClaw', 'Auto-Fix All Issues via OpenClaw')}</span>
              </button>
            </div>
          )}
        </div>

        {/* OpenClaw Intelligence Panel */}
        <OpenClawIntelligencePanel
          platform={platform}
          lang={lang}
          topic={briefDesc || title}
          goal={briefGoal}
          audience={briefAudience}
          tone={briefTone}
          niche={''}
          contentDraft={{ hook, caption, hashtags, cta }}
          onApplyHook={(h) => { setHook(h); setTitle(h); }}
        />

        {/* Content Preview */}
        <div className="premium-card flex-1 p-5 overflow-hidden bg-gray-50/50 dark:bg-gray-900/20 relative">
          <div className="absolute top-2 right-2 flex gap-1 z-10">
            {hook && <span className="text-[9px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">Hook Synced</span>}
            {firstComment && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">Comment Synced</span>}
          </div>
          <div className="text-center text-[10px] uppercase font-bold tracking-widest text-[hsl(var(--muted-foreground))] mb-4 border-b border-[hsl(var(--border))] pb-2">
            {L('معاينة المحتوى الحي المنسق', 'Structured Live Preview')}
          </div>
          <div className="flex justify-center items-center">
            {platform === 'instagram' && (
              <div className="flex flex-col gap-2">
                <div className="bg-white dark:bg-black rounded-2xl border border-[hsl(var(--border))] w-[260px] shadow-xl overflow-hidden">
                  <div className="p-3 flex items-center gap-2 border-b border-[hsl(var(--border))]">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-0.5"><div className="bg-white dark:bg-black h-full w-full rounded-full" /></div>
                    <span className="font-semibold text-xs">{selectedClient?.company_name || 'brand_account'}</span>
                  </div>
                  <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-4xl">📸</div>
                  <div className="p-3 bg-white dark:bg-black">
                    <div className="text-lg font-bold tracking-widest text-[hsl(var(--foreground))] mb-2">♡ 💬 ⏏ ⚲</div>
                    <p className="text-xs">
                      <span className="font-bold mr-1">{selectedClient?.company_name || 'brand'}</span>
                      {hook && <strong>{hook} </strong>}
                    </p>
                    {caption && <p className="text-xs mt-1 whitespace-pre-wrap">{caption}</p>}
                    {cta && <p className="text-[11px] font-bold mt-1.5">{cta}</p>}
                    {hashtags && <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">{hashtags}</p>}
                  </div>
                </div>
                {firstComment && (
                  <div className="bg-gray-50 dark:bg-gray-900 border border-[hsl(var(--border))] w-[260px] rounded-xl p-3 shadow-sm">
                    <p className="text-[10px] text-[hsl(var(--muted-foreground))] mb-0.5 font-bold uppercase tracking-wider">{L('في التعليق الأول:', 'First Comment:')}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400">{firstComment}</p>
                  </div>
                )}
              </div>
            )}
            {platform === 'tiktok' && (
              <div className="bg-black rounded-2xl border border-[hsl(var(--border))] w-[240px] h-[440px] shadow-2xl relative overflow-hidden flex flex-col justify-end p-4">
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
                <div className="relative z-10 w-4/5 space-y-1.5">
                  <p className="font-bold text-white text-xs">@{selectedClient?.company_name?.toLowerCase().replace(/\s/g, '_') || 'brand'}</p>
                  {hook && <p className="text-white text-xs font-bold leading-tight"><span className="bg-yellow-400 text-black px-1 rounded text-[10px]">{hook}</span></p>}
                  {caption && <p className="text-white text-[11px] opacity-90 line-clamp-2">{caption}</p>}
                  {cta && <p className="text-yellow-400 text-[11px] font-bold">{cta}</p>}
                  {hashtags && <p className="text-white/70 text-[10px] font-bold">{hashtags}</p>}
                </div>
                <div className="absolute right-3 bottom-10 flex flex-col items-center gap-3 z-10">
                  <div className="text-center"><div className="text-xl">❤️</div></div>
                  <div className="text-center"><div className="text-xl">💬</div></div>
                </div>
              </div>
            )}
            {platform === 'snapchat' && (
              <div className="bg-yellow-400 rounded-2xl border border-yellow-500 w-[240px] h-[440px] shadow-2xl relative overflow-hidden flex flex-col justify-center items-center p-4">
                <div className="bg-black/60 backdrop-blur-md rounded-xl p-3 w-full text-center max-w-[90%]">
                  {hook && <p className="text-white font-black text-sm mb-1 uppercase tracking-tight">{hook}</p>}
                  {caption && <p className="text-white/90 text-[11px] leading-tight mb-2">{caption}</p>}
                  {cta && <div className="mx-auto bg-white text-black text-[10px] font-bold px-3 py-1 rounded-full uppercase truncate max-w-[90%]">&gt; {cta}</div>}
                </div>
              </div>
            )}
            {platform === 'google_ads' && (
              <div className="bg-white dark:bg-black p-4 border border-[hsl(var(--border))] rounded-xl w-full max-w-[320px] shadow-md">
                <div className="flex gap-2 items-center mb-1">
                  <span className="text-[10px] bg-[hsl(var(--foreground))] text-[hsl(var(--background))] px-1 font-bold rounded">Ad</span>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">www.{selectedClient?.company_name?.toLowerCase().replace(/\s/g, '') || 'brand'}.com</span>
                </div>
                <h4 className="font-bold text-blue-600 dark:text-blue-400 text-sm">{title || hook || L('عنوان الإعلان', 'Ad Title')}</h4>
                <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 leading-relaxed">{caption || L('نص الإعلان', 'Ad description goes here. Make it concise and actionable for maximum conversion.')}</p>
                {cta && <div className="mt-2 text-blue-600 dark:text-blue-400 text-[11px] font-bold">› {cta}</div>}
                {hashtags && <div className="mt-3 pt-2 border-t border-[hsl(var(--border))]/50">
                  <span className="text-[9px] uppercase tracking-wider text-[hsl(var(--muted-foreground))] block mb-1">Keywords Config</span>
                  <p className="text-[10px] text-green-600 dark:text-green-400">{hashtags}</p>
                </div>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
