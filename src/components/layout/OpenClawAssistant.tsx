'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Sparkles, X, Send, Minimize2, Maximize2, Loader2, Zap,
  ChevronDown, RefreshCw, Terminal, Lock, CheckCircle2,
  XCircle, Clock, Copy, CornerDownLeft, Bot, User2,
  BookmarkPlus, Lightbulb, TrendingUp, Film, Hash,
  Pen, FileText, Star, ChevronRight, Trash2, Download
} from 'lucide-react'
import { useOpenClaw, resolveMode, MODE_META, SpecialistMode, DashboardContext } from '@/lib/openclaw/context'

// ─── Types ────────────────────────────────────────────────────────────────────
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  status?: 'sending' | 'done' | 'error'
  saved?: boolean
}

interface SavedItem {
  id: string
  label: string
  content: string
  type: 'idea' | 'hook' | 'trend' | 'script' | 'caption' | 'strategy'
  platform?: string
  client?: string
  savedAt: Date
}

type ExecStatus = 'queued' | 'running' | 'completed' | 'failed' | 'blocked'
interface ExecLog { id: string; action: string; status: ExecStatus; time: string; output?: string }

// ─── Expert Quick Actions ─────────────────────────────────────────────────────
const EXPERT_ACTIONS_AR = [
  { icon: '💡', label: 'أفكار محتوى', prompt: 'اقترح لي 5 أفكار محتوى قوية لهذا الأسبوع مناسبة للمنصة والعميل الحالي.' },
  { icon: '🔥', label: 'اكتب هوك', prompt: 'اكتب لي 5 هوكات عربية قوية وجاهزة للاستخدام الفوري.' },
  { icon: '📈', label: 'ترندات', prompt: 'ما أبرز الترندات الحالية التي تستحق التكيّف معها لعميلي؟' },
  { icon: '🎬', label: 'أسلوب الكليب', prompt: 'ما أفضل أسلوب تصوير وتحرير للمحتوى الحالي؟' },
  { icon: '✍️', label: 'حسّن الكابشن', prompt: 'راجع كابشني الحالي وأعد كتابته ليكون أكثر تأثيراً وجاذبية.' },
  { icon: '📝', label: 'سكريبت', prompt: 'اكتب لي نص سكريبت كامل جاهز للتصوير بناءً على السياق الحالي.' },
  { icon: '#️⃣', label: 'هاشتاقات', prompt: 'اقترح أفضل مجموعة هاشتاقات مخصصة للمنصة والمحتوى الحالي.' },
  { icon: '🎯', label: 'CTA قاتل', prompt: 'اكتب لي 3 CTAs عالية التحويل مناسبة للمنصة والجمهور.' },
]

const EXPERT_ACTIONS_EN = [
  { icon: '💡', label: 'Content Ideas', prompt: 'Suggest 5 strong content ideas for this week suitable for the current platform and client.' },
  { icon: '🔥', label: 'Write Hook', prompt: 'Write 5 powerful scroll-stopping hooks ready to use immediately.' },
  { icon: '📈', label: 'Trends', prompt: 'What current trends are worth adapting for my client right now?' },
  { icon: '🎬', label: 'Clip Style', prompt: 'What is the best filming and editing style for the current content?' },
  { icon: '✍️', label: 'Improve Caption', prompt: 'Review my current caption and rewrite it for maximum impact.' },
  { icon: '📝', label: 'Script', prompt: 'Write a complete ready-to-shoot script based on the current context.' },
  { icon: '#️⃣', label: 'Hashtags', prompt: 'Suggest the best custom hashtag set for the current platform and content.' },
  { icon: '🎯', label: 'Kill CTA', prompt: 'Write 3 high-converting CTAs suitable for the platform and audience.' },
]

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: ExecStatus }) {
  const map: Record<ExecStatus, { icon: React.ReactNode; cls: string; label: string }> = {
    queued:    { icon: <Clock className="h-2.5 w-2.5" />,                     cls: 'bg-gray-700 text-gray-300', label: 'Queued' },
    running:   { icon: <Loader2 className="h-2.5 w-2.5 animate-spin" />,     cls: 'bg-blue-800 text-blue-200', label: 'Running' },
    completed: { icon: <CheckCircle2 className="h-2.5 w-2.5" />,             cls: 'bg-green-800 text-green-200', label: 'Done' },
    failed:    { icon: <XCircle className="h-2.5 w-2.5" />,                  cls: 'bg-red-900 text-red-200', label: 'Failed' },
    blocked:   { icon: <Lock className="h-2.5 w-2.5" />,                     cls: 'bg-amber-900 text-amber-200', label: 'Blocked' },
  }
  const { icon, cls, label } = map[status]
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold ${cls}`}>
      {icon}{label}
    </span>
  )
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, onCopy, onSave, lang }: { msg: Message; onCopy: (text: string) => void; onSave: (msg: Message) => void; lang: string }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'} group`}>
      <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-0.5 ${
        isUser ? 'bg-purple-600 text-white' : 'bg-gradient-to-br from-indigo-600 to-purple-700 text-white'
      }`}>
        {isUser ? <User2 className="h-3.5 w-3.5" /> : <Sparkles className="h-3.5 w-3.5" />}
      </div>

      <div className={`max-w-[88%] flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? 'bg-purple-600 text-white rounded-br-none'
            : 'bg-[hsl(var(--card))] border border-[hsl(var(--border))] text-[hsl(var(--foreground))] rounded-bl-none shadow-sm'
        }`}
          style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        >
          {msg.status === 'error'
            ? <span className="text-red-400">{msg.content}</span>
            : msg.content
          }
        </div>
        {/* Actions */}
        <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
          <span className="text-[10px] text-[hsl(var(--muted-foreground))]">
            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {!isUser && (
            <>
              <button onClick={() => onCopy(msg.content)} className="text-[10px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] flex items-center gap-1 transition-colors">
                <Copy className="h-2.5 w-2.5" /> {lang === 'ar' ? 'نسخ' : 'Copy'}
              </button>
              <button onClick={() => onSave(msg)} className={`text-[10px] flex items-center gap-1 transition-colors ${msg.saved ? 'text-yellow-500' : 'text-[hsl(var(--muted-foreground))] hover:text-yellow-500'}`}>
                <BookmarkPlus className="h-2.5 w-2.5" /> {msg.saved ? (lang === 'ar' ? 'محفوظ ✓' : 'Saved ✓') : (lang === 'ar' ? 'حفظ' : 'Save')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Saved Items Panel ────────────────────────────────────────────────────────
function SavedPanel({ items, onDelete, lang }: { items: SavedItem[]; onDelete: (id: string) => void; lang: string }) {
  const typeIcon: Record<string, string> = { idea: '💡', hook: '🔥', trend: '📈', script: '📝', caption: '✍️', strategy: '🎯' }
  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-gray-800 flex items-center justify-between">
        <span className="text-yellow-400 font-bold text-xs flex items-center gap-1.5">
          <Star className="h-3.5 w-3.5" /> {lang === 'ar' ? 'المحفوظات' : 'Saved Items'} ({items.length})
        </span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {items.length === 0 && (
          <div className="text-center py-8 text-gray-500 text-xs">
            <BookmarkPlus className="h-8 w-8 mx-auto mb-2 opacity-30" />
            {lang === 'ar' ? 'لا توجد مخرجات محفوظة\nاضغط "حفظ" على أي رد لحفظه هنا' : 'No saved outputs yet\nClick "Save" on any response to store it here'}
          </div>
        )}
        {items.map(item => (
          <div key={item.id} className="bg-gray-800/50 border border-gray-700 rounded-xl p-3 space-y-2 group">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <span>{typeIcon[item.type] || '📋'}</span>
                  {item.label}
                </p>
                {item.platform && <span className="text-[9px] text-purple-400 uppercase font-bold">{item.platform}</span>}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => navigator.clipboard.writeText(item.content)} className="text-gray-400 hover:text-white p-1">
                  <Copy className="h-3 w-3" />
                </button>
                <button onClick={() => onDelete(item.id)} className="text-gray-400 hover:text-red-400 p-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-300 line-clamp-3 leading-relaxed">{item.content.slice(0, 200)}...</p>
            <p className="text-[9px] text-gray-600">{item.savedAt.toLocaleDateString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function OpenClawAssistant() {
  const { context, mode, setMode, dispatchAction } = useOpenClaw()
  const lang = context.language || 'en'

  const [isOpen, setIsOpen]             = useState(false)
  const [isExpanded, setIsExpanded]     = useState(false)
  const [showLog, setShowLog]           = useState(false)
  const [showModes, setShowModes]       = useState(false)
  const [showSaved, setShowSaved]       = useState(false)
  const [input, setInput]               = useState('')
  const [isTyping, setIsTyping]         = useState(false)
  const [copied, setCopied]             = useState(false)
  const [execLogs, setExecLogs]         = useState<ExecLog[]>([])
  const [savedItems, setSavedItems]     = useState<SavedItem[]>([])

  const [messages, setMessages] = useState<Message[]>([{
    id: 'init',
    role: 'assistant',
    content: lang === 'ar'
      ? `أهلاً 👋 أنا **OpenClaw** — خبيرك في المحتوى الرقمي واستراتيجية السوشيال ميديا.\n\nاستخدم الأوامر السريعة أدناه أو اكتب ما تحتاجه مباشرة:\n• أفكار محتوى 💡\n• هوكات قوية 🔥\n• ترندات 📈\n• سكریبت 📝\n• تحسين كابشن ✍️\n\nكيف تريد نبدأ؟`
      : `Hey 👋 I'm **OpenClaw** — your digital content expert and social media strategist.\n\nUse the quick actions below or type what you need:\n• Content ideas 💡\n• Strong hooks 🔥\n• Trends 📈\n• Scripts 📝\n• Caption improvement ✍️\n\nWhat shall we work on?`,
    timestamp: new Date(),
    status: 'done',
  }])

  const endRef   = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const logRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }) }, [execLogs])

  const activeMode = resolveMode(context.currentPage || '', mode)
  const activeMeta = MODE_META[activeMode]

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? input).trim()
    if (!text || isTyping) return

    const userMsg: Message  = { id: Date.now().toString(), role: 'user', content: text, timestamp: new Date(), status: 'done' }
    const assistantId = `a-${Date.now()}`
    const thinkingMsg: Message = { id: assistantId, role: 'assistant', content: '...', timestamp: new Date(), status: 'sending' }

    setMessages(prev => [...prev, userMsg, thinkingMsg])
    setInput('')
    setIsTyping(true)

    const logId = `log-${Date.now()}`
    setExecLogs(prev => [...prev, { id: logId, action: lang === 'ar' ? 'معالجة الطلب' : 'Processing request', status: 'running', time: new Date().toLocaleTimeString() }])

    try {
      const res = await fetch('/api/openclaw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          payload: {
            lang,
            mode: activeMode,
            context,
            messages: [...messages.filter(m => m.status !== 'sending').slice(-10), userMsg],
          }
        })
      })

      const json = await res.json()

      if (json.success && json.data) {
        let replyText = json.data

        // Auto-extract JSON fields for draft editor
        const jsonMatch = replyText.match(/```json\s*(\{[\s\S]*?\})\s*```/i)
        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[1])
            if (parsed.hook || parsed.caption || parsed.hashtags || parsed.cta || parsed.title) {
              dispatchAction('apply_draft', parsed)
              replyText = replyText.replace(jsonMatch[0], '').trim()
              if (!replyText) replyText = lang === 'ar' ? '✅ تم تحديث المحتوى في المحرر!' : '✅ Content fields auto-updated in the editor!'
              setExecLogs(prev => [...prev, { id: `exec-${Date.now()}`, action: lang === 'ar' ? 'تحديث حقول المحرر' : 'Update Editor Fields', status: 'completed', time: new Date().toLocaleTimeString(), output: 'Applied' }])
            }
          } catch (e) {
            console.error('JSON parse error', e)
          }
        }

        setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: replyText, status: 'done' } : m))
        setExecLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'completed', output: lang === 'ar' ? 'اكتمل' : 'Replied' } : l))
      } else {
        throw new Error(json.error || 'No response')
      }
    } catch (err: any) {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: `⚠️ ${err.message || 'خطأ في الاتصال'}`, status: 'error' } : m))
      setExecLogs(prev => prev.map(l => l.id === logId ? { ...l, status: 'failed', output: err.message } : l))
    } finally {
      setIsTyping(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [input, isTyping, messages, lang, activeMode, context])

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSaveMessage = (msg: Message) => {
    const newItem: SavedItem = {
      id: `si-${Date.now()}`,
      label: lang === 'ar' ? `مخرج OpenClaw ${new Date().toLocaleDateString('ar-SA')}` : `OpenClaw Output ${new Date().toLocaleDateString()}`,
      content: msg.content,
      type: msg.content.includes('هوك') || msg.content.toLowerCase().includes('hook') ? 'hook'
        : msg.content.includes('فكرة') || msg.content.toLowerCase().includes('idea') ? 'idea'
        : msg.content.includes('ترند') || msg.content.toLowerCase().includes('trend') ? 'trend'
        : msg.content.includes('سكريبت') || msg.content.toLowerCase().includes('script') ? 'script'
        : msg.content.includes('كابشن') || msg.content.toLowerCase().includes('caption') ? 'caption' : 'strategy',
      platform: context.platform,
      client: context.clientName,
      savedAt: new Date(),
    }
    setSavedItems(prev => [newItem, ...prev])
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, saved: true } : m))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
  }

  const expertActions = lang === 'ar' ? EXPERT_ACTIONS_AR : EXPERT_ACTIONS_EN

  // ── Floating Bubble ───────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 shadow-2xl flex items-center justify-center text-white hover:scale-110 active:scale-95 transition-all z-50 border-2 border-purple-400/50 group"
        title="OpenClaw AI"
      >
        <Sparkles className="h-6 w-6 group-hover:rotate-12 transition-transform" />
        <span className="absolute inset-0 rounded-full animate-ping bg-purple-600/25 pointer-events-none" />
        {savedItems.length > 0 && (
          <span className="absolute -top-1 -right-1 h-4 w-4 bg-yellow-400 text-gray-900 rounded-full text-[9px] font-black flex items-center justify-center">
            {savedItems.length}
          </span>
        )}
      </button>
    )
  }

  // ── Full Panel ────────────────────────────────────────────────────────────
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl shadow-2xl border border-purple-900/50 bg-[hsl(var(--background))] overflow-hidden transition-all duration-300 ${
      isExpanded ? 'w-[720px] h-[88vh]' : 'w-[420px] h-[620px]'
    }`}>

      {/* ── Header ── */}
      <div className="bg-gradient-to-r from-indigo-900 via-purple-900 to-indigo-900 text-white px-4 py-3 flex items-center gap-3 flex-shrink-0">
        <div className="h-8 w-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center flex-shrink-0 relative">
          <Sparkles className="h-4 w-4 text-yellow-300" />
          <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 bg-emerald-400 rounded-full border-2 border-indigo-900" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-black text-sm tracking-wide">OpenClaw</h3>
            <button
              onClick={() => setShowModes(!showModes)}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-[10px] font-bold uppercase tracking-wider transition-colors ${activeMeta.color}`}
            >
              <span>{activeMeta.icon}</span>
              <span className="hidden sm:inline">{lang === 'ar' ? activeMeta.labelAr : activeMeta.label}</span>
              <ChevronDown className="h-2.5 w-2.5 opacity-70" />
            </button>
          </div>
          <p className="text-[9px] text-white/50 mt-0.5 uppercase tracking-widest">
            {lang === 'ar' ? `خبير السوشيال ميديا ${context.platform ? `· ${context.platform}` : ''} ${context.clientName ? `· ${context.clientName}` : ''}` : `Social Media Expert ${context.platform ? `· ${context.platform}` : ''} ${context.clientName ? `· ${context.clientName}` : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button title={lang === 'ar' ? 'المحفوظات' : 'Saved'} onClick={() => { setShowSaved(!showSaved); setShowLog(false) }}
            className={`p-1.5 rounded-lg transition-colors relative ${showSaved ? 'bg-yellow-500/20 text-yellow-300' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
            <Star className="h-3.5 w-3.5" />
            {savedItems.length > 0 && <span className="absolute -top-0.5 -right-0.5 h-3 w-3 bg-yellow-400 text-gray-900 rounded-full text-[8px] font-black flex items-center justify-center">{savedItems.length}</span>}
          </button>
          <button title="Execution log" onClick={() => { setShowLog(!showLog); setShowSaved(false) }}
            className={`p-1.5 rounded-lg transition-colors ${showLog ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white hover:bg-white/10'}`}>
            <Terminal className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors">
            {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-white/60 hover:text-red-300 hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Mode Switcher ── */}
      {showModes && (
        <div className="absolute top-[60px] right-4 z-20 w-64 bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-xl shadow-2xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))] border-b border-[hsl(var(--border))]">
            {lang === 'ar' ? 'وضع الخبير' : 'Specialist Mode'}
          </div>
          {(Object.keys(MODE_META) as SpecialistMode[]).map(m => (
            <button key={m} onClick={() => { setMode(m); setShowModes(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-[hsl(var(--muted))] transition-colors ${mode === m ? 'bg-purple-500/10 font-bold' : ''}`}>
              <span className="text-base">{MODE_META[m].icon}</span>
              <span className={MODE_META[m].color}>{lang === 'ar' ? MODE_META[m].labelAr : MODE_META[m].label}</span>
              {mode === m && <CheckCircle2 className="h-3.5 w-3.5 text-purple-500 ml-auto" />}
            </button>
          ))}
        </div>
      )}

      {/* ── Exec Log ── */}
      {showLog && (
        <div className="border-b border-[hsl(var(--border))] bg-gray-950 flex-shrink-0" style={{ maxHeight: 130 }}>
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-800">
            <span className="text-[10px] text-green-400 font-bold uppercase tracking-widest flex items-center gap-1">
              <Terminal className="h-2.5 w-2.5" /> Execution Log
            </span>
            <button onClick={() => setExecLogs([])} className="text-gray-600 hover:text-red-400 text-[9px] font-bold">Clear</button>
          </div>
          <div ref={logRef} className="overflow-y-auto px-3 py-2 space-y-1 font-mono" style={{ maxHeight: 90 }}>
            {execLogs.length === 0 && <p className="text-gray-600 text-[10px] text-center py-2">No actions yet.</p>}
            {execLogs.map(l => (
              <div key={l.id} className="flex items-center gap-2 text-[10px]">
                <StatusBadge status={l.status} />
                <span className="text-gray-400 truncate">{l.action}</span>
                {l.output && <span className="text-green-500/70 truncate">→ {l.output}</span>}
                <span className="text-gray-600 ml-auto flex-shrink-0">{l.time}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Saved Panel ── */}
      {showSaved ? (
        <div className="flex-1 overflow-hidden bg-gray-950 text-white">
          <SavedPanel items={savedItems} onDelete={(id) => setSavedItems(prev => prev.filter(i => i.id !== id))} lang={lang} />
        </div>
      ) : (
        <>
          {/* ── Messages ── */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 scroll-smooth" onClick={() => setShowModes(false)}>
            {messages.map(msg => (
              <MessageBubble key={msg.id} msg={msg} onCopy={handleCopy} onSave={handleSaveMessage} lang={lang} />
            ))}
            {isTyping && (
              <div className="flex gap-2.5">
                <div className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-600 to-purple-700 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3.5 w-3.5 text-white" />
                </div>
                <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] rounded-2xl rounded-bl-none px-4 py-3 flex items-center gap-2 shadow-sm">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="h-1.5 w-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                  <span className="text-xs text-[hsl(var(--muted-foreground))]">
                    {lang === 'ar' ? 'OpenClaw يحلل...' : 'OpenClaw thinking...'}
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* ── Expert Actions Strip ── */}
          <div className="px-3 py-2 border-t border-[hsl(var(--border))] flex-shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
              {expertActions.map(action => (
                <button
                  key={action.label}
                  onClick={() => handleSend(action.prompt)}
                  disabled={isTyping}
                  className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full bg-[hsl(var(--muted))] hover:bg-purple-500/15 hover:text-purple-600 dark:hover:text-purple-400 border border-[hsl(var(--border))] hover:border-purple-400/40 transition-all disabled:opacity-40 text-[hsl(var(--muted-foreground))]"
                >
                  <span>{action.icon}</span>
                  {action.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── Input ── */}
          <div className="px-3 pb-3 pt-1 flex-shrink-0">
            <div className="relative flex items-end gap-2 bg-[hsl(var(--muted))] border border-[hsl(var(--border))] rounded-xl focus-within:border-purple-500/60 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
                placeholder={lang === 'ar' ? 'اكتب سؤالك أو طلبك لـ OpenClaw...' : 'Ask OpenClaw anything...'}
                className="flex-1 bg-transparent resize-none text-sm px-3 py-3 outline-none placeholder-[hsl(var(--muted-foreground))] text-[hsl(var(--foreground))] max-h-[100px] min-h-[44px] disabled:opacity-50"
                rows={1}
                style={{ direction: lang === 'ar' ? 'rtl' : 'ltr' }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isTyping}
                className="flex-shrink-0 mb-2 mr-2 h-8 w-8 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center transition-all shadow-md hover:shadow-purple-500/25 hover:scale-105 active:scale-95"
              >
                {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[9px] text-[hsl(var(--muted-foreground))] text-center mt-1.5 flex items-center justify-center gap-1">
              <CornerDownLeft className="h-2.5 w-2.5" />
              {lang === 'ar' ? 'Enter للإرسال · Shift+Enter لسطر جديد' : 'Enter to send · Shift+Enter for new line'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
