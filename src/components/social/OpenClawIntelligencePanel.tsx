'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Brain, Clock, TrendingUp, Zap, Info, CheckCircle2, FlaskConical,
  BarChart3, ChevronDown, ChevronRight, AlertTriangle, Lightbulb,
  RefreshCw, Loader2, Target, Hash, Eye, Sparkles, ArrowRight
} from 'lucide-react'

type ConfidenceLevel = 'data-based' | 'strong-inference' | 'recommended-test'

interface PostingWindow {
  day: string; dayAr: string
  timeSlot: string; timeSlotAr: string
  reasoning: string; reasoningAr: string
  confidence: ConfidenceLevel
  engagementScore: number
}

interface HookSuggestion {
  hook: string; hookAr?: string
  framework: string; frameworkAr: string
  trigger: string; triggerAr: string
  platformFit: number
  whyItWorks: string; whyItWorksAr: string
  confidence: ConfidenceLevel
}

interface IntelligenceItem {
  id: string
  title: string; titleAr: string
  reasoning: string; reasoningAr: string
  confidence: ConfidenceLevel
  source: string; sourceAr: string
  tags?: string[]
}

interface IntelligenceData {
  postingWindows: PostingWindow[]
  hookLibrary: HookSuggestion[]
  insights: IntelligenceItem[]
  meta: { platform: string; lang: string; confidenceNote: string }
}

// ─── Confidence Badge ──────────────────────────────────────────────────────────
function ConfidenceBadge({ level, lang }: { level: ConfidenceLevel; lang: string }) {
  const isAr = lang === 'ar'
  const map: Record<ConfidenceLevel, { icon: React.ReactNode; label: string; labelAr: string; cls: string }> = {
    'data-based':          { icon: <CheckCircle2 className="h-2.5 w-2.5" />, label: 'Data-Based', labelAr: 'مبني على بيانات', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' },
    'strong-inference':    { icon: <BarChart3 className="h-2.5 w-2.5" />,    label: 'Strong Inference', labelAr: 'استنتاج قوي', cls: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30' },
    'recommended-test':    { icon: <FlaskConical className="h-2.5 w-2.5" />, label: 'Recommended Test', labelAr: 'اختبار موصى به', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30' },
  }
  const { icon, label, labelAr, cls } = map[level]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${cls}`}>
      {icon}{isAr ? labelAr : label}
    </span>
  )
}

// ─── Engagement Score Bar ──────────────────────────────────────────────────────
function EngagementBar({ score }: { score: number }) {
  const color = score >= 85 ? 'bg-emerald-500' : score >= 70 ? 'bg-blue-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2 mt-1">
      <div className="flex-1 h-1.5 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] tabular-nums">{score}</span>
    </div>
  )
}

// ─── Platform Fit Dots ─────────────────────────────────────────────────────────
function PlatformFit({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className={`h-1.5 w-1.5 rounded-full ${i < score ? 'bg-purple-500' : 'bg-[hsl(var(--muted))]'}`} />
      ))}
      <span className="text-[10px] text-[hsl(var(--muted-foreground))] ml-1">{score}/10</span>
    </div>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
interface Props {
  platform: string
  lang: string
  topic?: string
  goal?: string
  audience?: string
  tone?: string
  niche?: string
  contentDraft?: { hook?: string; caption?: string; hashtags?: string; cta?: string }
  onApplyHook?: (hook: string) => void
}

export function OpenClawIntelligencePanel({
  platform, lang, topic = '', goal = '', audience = '', tone = '', niche = '',
  contentDraft, onApplyHook
}: Props) {
  const isAr = lang === 'ar'
  const L = (ar: string, en: string) => isAr ? ar : en

  const [data, setData] = useState<IntelligenceData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'insights' | 'windows' | 'hooks'>('insights')
  const [expandedHook, setExpandedHook] = useState<number | null>(null)
  const [expandedWindow, setExpandedWindow] = useState<number | null>(null)

  const fetch_intelligence = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/openclaw/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform, lang, topic, goal, audience, tone, niche, contentDraft, hasPerformanceData: false })
      })
      const json = await res.json()
      if (json.success) setData(json.data)
      else setError(json.error || 'Failed')
    } catch { setError(L('تعذّر تحميل الذكاء', 'Failed to load intelligence')) }
    finally { setLoading(false) }
  }, [platform, lang, topic, goal, audience, tone, niche, contentDraft])

  useEffect(() => { fetch_intelligence() }, [platform, lang])

  const TABS = [
    { id: 'insights'  as const, label: L('تحليل المحتوى', 'Content Insights'),     icon: <Brain className="h-3.5 w-3.5" /> },
    { id: 'windows'   as const, label: L('أوقات النشر', 'Posting Windows'),         icon: <Clock className="h-3.5 w-3.5" /> },
    { id: 'hooks'     as const, label: L('مكتبة الهوكات', 'Hook Library'),          icon: <Zap className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="premium-card overflow-hidden bg-gradient-to-br from-indigo-50/30 to-purple-50/30 dark:from-indigo-950/10 dark:to-purple-950/10 border border-indigo-200/60 dark:border-indigo-800/30">

      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[hsl(var(--border))] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center">
            <Brain className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="font-bold text-sm">{L('ذكاء OpenClaw', 'OpenClaw Intelligence')}</h3>
            <p className="text-[10px] text-[hsl(var(--muted-foreground))]">{L('توصيات مبنية على أدلة • لا مخرجات عشوائية', 'Evidence-based recommendations • No random outputs')}</p>
          </div>
        </div>
        <button onClick={fetch_intelligence} disabled={loading} className="text-indigo-500 hover:text-indigo-600 disabled:opacity-50 transition-colors">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Confidence Legend */}
      <div className="px-5 py-2 border-b border-[hsl(var(--border))] flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider">{L('مستوى الثقة:', 'Confidence:')}</span>
        <ConfidenceBadge level="data-based" lang={lang} />
        <ConfidenceBadge level="strong-inference" lang={lang} />
        <ConfidenceBadge level="recommended-test" lang={lang} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[hsl(var(--border))]">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-all ${
              activeTab === tab.id
                ? 'text-indigo-600 dark:text-indigo-400 border-b-2 border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20'
                : 'text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]'
            }`}>
            {tab.icon}{tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="p-4">
        {loading && (
          <div className="flex items-center justify-center py-10 gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
            <span className="text-sm text-[hsl(var(--muted-foreground))]">{L('يحلّل السياق ويبني التوصيات...', 'Analyzing context and building recommendations...')}</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-500 py-4 text-sm">
            <AlertTriangle className="h-4 w-4" />{error}
          </div>
        )}

        {/* ── INSIGHTS TAB ─────────────────────────────────────────────────── */}
        {!loading && data && activeTab === 'insights' && (
          <div className="space-y-3">
            {/* Meta note */}
            <div className="flex items-start gap-2 p-3 bg-indigo-50/60 dark:bg-indigo-950/20 rounded-xl border border-indigo-200/50 dark:border-indigo-800/30">
              <Info className="h-3.5 w-3.5 text-indigo-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">{data.meta.confidenceNote}</p>
            </div>

            {data.insights.length === 0 && (
              <p className="text-sm text-center text-[hsl(var(--muted-foreground))] py-6">
                {L('أكمل بريف الحملة لتوليد رؤى مخصصة', 'Complete the campaign brief to generate custom insights')}
              </p>
            )}

            {data.insights.map((item) => (
              <div key={item.id} className={`rounded-xl border p-4 space-y-2.5 ${
                item.confidence === 'data-based' ? 'border-emerald-200 bg-emerald-50/40 dark:border-emerald-800/30 dark:bg-emerald-950/10' :
                item.confidence === 'strong-inference' ? 'border-blue-200 bg-blue-50/40 dark:border-blue-800/30 dark:bg-blue-950/10' :
                'border-amber-200 bg-amber-50/40 dark:border-amber-800/30 dark:bg-amber-950/10'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-xs leading-snug flex-1">{isAr ? item.titleAr : item.title}</p>
                  <ConfidenceBadge level={item.confidence} lang={lang} />
                </div>
                <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                  {isAr ? item.reasoningAr : item.reasoning}
                </p>
                <div className="flex items-center gap-1.5 text-[10px] text-[hsl(var(--muted-foreground))] border-t border-current/10 pt-2">
                  <span className="font-semibold uppercase tracking-wider">{L('المصدر:', 'Source:')}</span>
                  <span>{isAr ? item.sourceAr : item.source}</span>
                </div>
                {item.tags && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map(tag => (
                      <span key={tag} className="text-[9px] px-1.5 py-0.5 bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] rounded font-mono">#{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── POSTING WINDOWS TAB ─────────────────────────────────────────── */}
        {!loading && data && activeTab === 'windows' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-xl border border-amber-200/50 dark:border-amber-800/30">
              <Info className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed">
                {L(
                  'هذه التوصيات مبنية على أنماط سلوك المنصة لمنطقة GCC. إذا كان لديك بيانات Analytics فعلية للحساب، استخدمها أولاً — فهي تتفوق على أي تقديرات عامة.',
                  'These recommendations are based on GCC-region platform behavior patterns. If you have actual account Analytics data, use it first — it overrides all general estimates.'
                )}
              </p>
            </div>

            {data.postingWindows.map((w, i) => (
              <div key={i} className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                <button onClick={() => setExpandedWindow(expandedWindow === i ? null : i)}
                  className="w-full p-4 flex items-center justify-between gap-3 hover:bg-[hsl(var(--muted)/0.4)] transition-all">
                  <div className="flex-1 text-left" dir={isAr ? 'rtl' : 'ltr'}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm">{isAr ? w.dayAr : w.day}</span>
                      <span className="text-[hsl(var(--muted-foreground))] text-xs">·</span>
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">{isAr ? w.timeSlotAr : w.timeSlot}</span>
                    </div>
                    <EngagementBar score={w.engagementScore} />
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <ConfidenceBadge level={w.confidence} lang={lang} />
                    {expandedWindow === i ? <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" /> : <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" />}
                  </div>
                </button>
                {expandedWindow === i && (
                  <div className="px-4 pb-4 pt-1 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.3)]">
                    <div className="flex items-start gap-2">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">
                        {L('السبب:', 'Why:')} {isAr ? w.reasoningAr : w.reasoning}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── HOOK LIBRARY TAB ─────────────────────────────────────────────── */}
        {!loading && data && activeTab === 'hooks' && (
          <div className="space-y-3">
            <div className="flex items-start gap-2 p-3 bg-purple-50/60 dark:bg-purple-950/20 rounded-xl border border-purple-200/50 dark:border-purple-800/30">
              <Brain className="h-3.5 w-3.5 text-purple-500 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-purple-700 dark:text-purple-300 leading-relaxed">
                {L(
                  'كل هوك مبني على إطار نفسي موثّق. مرتّبة حسب توافق المنصة. اضغط لقراءة "لماذا يعمل" قبل الاستخدام.',
                  'Each hook is built on a documented psychological framework. Ranked by platform fit. Tap to read "Why it works" before using.'
                )}
              </p>
            </div>

            {data.hookLibrary.map((h, i) => (
              <div key={i} className="rounded-xl border border-[hsl(var(--border))] overflow-hidden">
                <button onClick={() => setExpandedHook(expandedHook === i ? null : i)}
                  className="w-full p-4 text-left hover:bg-[hsl(var(--muted)/0.4)] transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="font-bold text-sm leading-snug text-[hsl(var(--foreground))]" dir={isAr ? 'rtl' : 'ltr'}>
                        &ldquo;{isAr && h.hookAr ? h.hookAr : h.hook}&rdquo;
                      </p>
                      <div className="mt-2 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30 px-2 py-0.5 rounded">
                          {isAr ? h.frameworkAr : h.framework}
                        </span>
                        <ConfidenceBadge level={h.confidence} lang={lang} />
                      </div>
                    </div>
                    {expandedHook === i ? <ChevronDown className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))] flex-shrink-0" />}
                  </div>
                  <div className="mt-2.5">
                    <PlatformFit score={h.platformFit} />
                  </div>
                </button>

                {expandedHook === i && (
                  <div className="border-t border-[hsl(var(--border))] p-4 space-y-3 bg-[hsl(var(--muted)/0.3)]">
                    <div>
                      <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">{L('المحفز النفسي:', 'Psychological Trigger:')}</p>
                      <p className="text-xs text-[hsl(var(--foreground))]">{isAr ? h.triggerAr : h.trigger}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-[hsl(var(--muted-foreground))] uppercase tracking-wider mb-1">{L('لماذا يعمل:', 'Why It Works:')}</p>
                      <p className="text-[11px] text-[hsl(var(--muted-foreground))] leading-relaxed">{isAr ? h.whyItWorksAr : h.whyItWorks}</p>
                    </div>
                    {onApplyHook && (
                      <button
                        onClick={() => onApplyHook(isAr && h.hookAr ? h.hookAr : h.hook)}
                        className="w-full text-xs font-bold text-center text-white bg-purple-600 hover:bg-purple-700 p-2.5 rounded-lg flex items-center justify-center gap-2 transition-all shadow-sm"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                        {L('تطبيق هذا الهوك على المحرر', 'Apply this hook to the editor')}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
