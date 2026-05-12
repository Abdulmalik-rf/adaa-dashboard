'use client'

import { useEffect, useRef, useState } from 'react'
import { Sparkles, X, Send, Loader2, Trash2 } from 'lucide-react'
import { useLanguage } from '@/lib/i18n/LanguageContext'

// Floating chat panel for the dashboard. Talks to /api/agent/chat, which
// speaks the same ChatGPT Codex + Supabase tool loop as the WhatsApp agent.
// Conversation state is client-side only (React + localStorage) — the server
// is stateless; we send recent turns with each request.

type Turn = { role: 'user' | 'assistant'; text: string; id: string }

const STORAGE_KEY = 'emergize-chat-history-v1'
const MAX_STORED_TURNS = 30

function uid() {
  return Math.random().toString(36).slice(2, 10)
}

export function ChatWidget() {
  const { dir, language } = useLanguage()
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // RTL → left-side anchor, LTR → right-side anchor. The user explicitly
  // asked for the chat button to flip in Arabic.
  const anchorClass = dir === 'rtl' ? 'left-6' : 'right-6'
  const ar = language === 'ar'

  // Load history on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Turn[]
        if (Array.isArray(parsed)) setTurns(parsed.slice(-MAX_STORED_TURNS))
      }
    } catch {}
  }, [])

  // Persist on change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-MAX_STORED_TURNS)))
    } catch {}
  }, [turns])

  // Keep the panel scrolled to the newest message.
  useEffect(() => {
    if (!open) return
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns, open, sending])

  // Focus input when opening.
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50)
  }, [open])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setError(null)
    const userTurn: Turn = { role: 'user', text, id: uid() }
    setTurns((ts) => [...ts, userTurn])
    setInput('')
    setSending(true)

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: turns.map((t) => ({ role: t.role, text: t.text })),
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error ?? `HTTP ${res.status}`)
      }
      const data = await res.json()
      const reply: Turn = { role: 'assistant', text: data.reply ?? '(empty)', id: uid() }
      setTurns((ts) => [...ts, reply])
    } catch (err: any) {
      setError(err?.message ?? 'something went wrong')
    } finally {
      setSending(false)
    }
  }

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const clearHistory = () => {
    if (!confirm(ar ? 'مسح سجل المحادثة؟' : 'Clear the chat history?')) return
    setTurns([])
    setError(null)
  }

  return (
    <>
      {/* Floating launcher — anchors to inline-end (right LTR / left RTL) */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={`fixed bottom-6 ${anchorClass} z-40 h-14 w-14 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-zinc-900 shadow-xl shadow-[hsl(var(--primary)/0.35)] flex items-center justify-center text-zinc-900 hover:scale-105 transition-transform`}
          aria-label={ar ? 'فتح محادثة الوكيل' : 'Open agent chat'}
          title={ar ? 'محادثة الوكيل' : 'Agent chat'}
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className={`fixed bottom-6 ${anchorClass} z-40 w-[380px] max-w-[calc(100vw-24px)] h-[560px] max-h-[calc(100vh-40px)] rounded-2xl bg-[hsl(var(--card))] border border-[hsl(var(--border))] shadow-2xl flex flex-col overflow-hidden`} dir={dir}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-[hsl(var(--border))] bg-gradient-to-r from-[hsl(var(--primary)/0.08)] to-transparent">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[hsl(var(--primary))] to-zinc-900 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-zinc-900" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{ar ? 'وكيل إمرجايز' : 'Emergize Agent'}</p>
              <p className="text-[10px] text-[hsl(var(--muted-foreground))]">
                {ar ? 'اطلب مني إضافة عملاء، أو ضبط تذكيرات، أو صياغة عروض أسعار…' : 'Ask me to add clients, set reminders, draft quotations…'}
              </p>
            </div>
            <button
              onClick={clearHistory}
              title={ar ? 'مسح المحادثة' : 'Clear chat'}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setOpen(false)}
              title={ar ? 'إغلاق' : 'Close'}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted)/0.5)] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 text-sm">
            {turns.length === 0 && (
              <div className="text-[hsl(var(--muted-foreground))] text-center pt-8 space-y-2">
                <p className="font-medium">{ar ? 'ابدأ بكتابة أمر:' : 'Start by typing a command:'}</p>
                <ul className={`text-xs space-y-1 max-w-[240px] mx-auto list-disc list-inside ${ar ? 'text-right' : 'text-left'}`}>
                  {ar ? (
                    <>
                      <li>أضف عميل شركة Acme، جهة الاتصال جون دو</li>
                      <li>ذكّرني بالاتصال بـ Acme الجمعة الساعة 3 عصراً</li>
                      <li>حدّد مهمة &quot;إعداد المقترح&quot; كمكتملة</li>
                      <li>اعرض على Acme باقة سوشيال ميديا بـ 3000 ر.س</li>
                    </>
                  ) : (
                    <>
                      <li>add client Acme Co, contact John Doe</li>
                      <li>remind me to call Acme Friday at 3pm</li>
                      <li>mark task &quot;prepare proposal&quot; as completed</li>
                      <li>quote Acme for social media pkg 3000 SAR</li>
                    </>
                  )}
                </ul>
              </div>
            )}

            {turns.map((t) => (
              <div
                key={t.id}
                className={`flex ${t.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] px-3 py-2 rounded-2xl whitespace-pre-wrap break-words text-sm leading-relaxed ${
                    t.role === 'user'
                      ? `bg-[hsl(var(--primary))] text-white ${ar ? 'rounded-bl-sm' : 'rounded-br-sm'}`
                      : `bg-[hsl(var(--muted)/0.5)] text-[hsl(var(--foreground))] ${ar ? 'rounded-br-sm' : 'rounded-bl-sm'} border border-[hsl(var(--border))]`
                  }`}
                >
                  {t.text}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-[hsl(var(--muted)/0.5)] border border-[hsl(var(--border))] px-3 py-2 rounded-2xl rounded-bl-sm flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <Loader2 className="h-3 w-3 animate-spin" /> {ar ? 'جاري التفكير…' : 'thinking…'}
                </div>
              </div>
            )}

            {error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 text-xs">
                {error}
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[hsl(var(--border))] p-3 flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              rows={1}
              placeholder={ar ? 'أخبر الوكيل بما تريد…' : 'Tell the agent what to do…'}
              dir={dir}
              className={`flex-1 resize-none rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 text-sm focus:outline-none focus:border-[hsl(var(--primary))] focus:ring-2 focus:ring-[hsl(var(--primary)/0.15)] max-h-28 ${ar ? 'text-right' : 'text-left'}`}
              disabled={sending}
            />
            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className="h-9 w-9 rounded-xl bg-[hsl(var(--primary))] text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
              aria-label={ar ? 'إرسال' : 'Send'}
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
