'use client'

import { useRef, useState } from 'react'
import { Plus, X, Upload, Image as ImageIcon, Film, Send, Loader2, Building } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { submitContentForReview } from '@/app/actions/content-uploads'

type Client = { id: string; company_name: string }

export function SubmitPostModal({ clients }: { clients: Client[] }) {
  const { language } = useLanguage()
  const ar = language === 'ar'

  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [okMessage, setOkMessage] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ url: string; isVideo: boolean; name: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  function reset() {
    setOpen(false)
    setSubmitting(false)
    setError(null)
    setOkMessage(null)
    if (preview) URL.revokeObjectURL(preview.url)
    setPreview(null)
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (preview) URL.revokeObjectURL(preview.url)
    if (!f) {
      setPreview(null)
      return
    }
    setPreview({
      url: URL.createObjectURL(f),
      isVideo: f.type.startsWith('video/'),
      name: f.name,
    })
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setOkMessage(null)
    setSubmitting(true)
    try {
      const formData = new FormData(e.currentTarget)
      const result = await submitContentForReview(formData)
      if (!result.ok) {
        setError(result.error)
      } else {
        setOkMessage(ar ? 'تم الإرسال للمراجعة!' : 'Submitted for review!')
        // Reset the form state but keep the success message visible briefly.
        if (formRef.current) formRef.current.reset()
        if (preview) URL.revokeObjectURL(preview.url)
        setPreview(null)
        setTimeout(() => reset(), 1100)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Unexpected error')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="mx-2 h-4 w-4" /> {ar ? 'إرسال منشور للمراجعة' : 'Submit Post for Review'}
      </Button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white text-gray-900 w-full max-w-lg rounded-2xl shadow-2xl border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            {ar ? 'إرسال منشور للمراجعة' : 'Submit Post for Review'}
          </h2>
          <button onClick={reset} className="text-gray-400 hover:text-gray-700">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form ref={formRef} onSubmit={onSubmit} className="p-6 space-y-4">
          {/* Client */}
          <div className="space-y-2">
            <label className="text-sm font-semibold flex items-center gap-2">
              <Building className="h-3 w-3" />
              {ar ? 'العميل' : 'Client'}
            </label>
            <select
              name="client_id"
              required
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm"
            >
              <option value="">{ar ? 'اختر عميلاً…' : 'Select a client…'}</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{ar ? 'عنوان قصير' : 'Short title'}</label>
            <input
              name="title"
              required
              maxLength={120}
              placeholder={ar ? 'مثال: ريل إطلاق المجموعة الشتوية' : 'e.g. Winter launch reel'}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm"
            />
          </div>

          {/* Platform + Type */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-semibold">{ar ? 'المنصة' : 'Platform'}</label>
              <select
                name="platform"
                defaultValue="instagram"
                className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm"
              >
                <option value="instagram">Instagram</option>
                <option value="tiktok">TikTok</option>
                <option value="snapchat">Snapchat</option>
                <option value="google_ads">Google Ads</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-semibold">{ar ? 'النوع' : 'Type'}</label>
              <select
                name="content_type"
                defaultValue="post"
                className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm"
              >
                <option value="post">{ar ? 'منشور' : 'Post'}</option>
                <option value="reel">{ar ? 'ريل' : 'Reel'}</option>
                <option value="story">{ar ? 'ستوري' : 'Story'}</option>
                <option value="ad">{ar ? 'إعلان' : 'Ad'}</option>
              </select>
            </div>
          </div>

          {/* Description / pitch */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{ar ? 'الوصف (ما الذي يريد المنشور قوله؟)' : 'Description (what is this post about?)'}</label>
            <textarea
              name="description"
              rows={3}
              placeholder={ar ? 'اشرح فكرة المنشور للمسؤول لمراجعتها…' : 'Explain the idea so the admin can review it…'}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm resize-none"
            />
          </div>

          {/* Caption */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{ar ? 'التسمية التوضيحية (اختيارية)' : 'Caption (optional)'}</label>
            <textarea
              name="caption"
              rows={2}
              placeholder={ar ? 'النص الذي سيظهر مع المنشور…' : 'Text that will appear with the post…'}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm resize-none"
            />
          </div>

          {/* Publish date */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{ar ? 'تاريخ النشر المقترح' : 'Proposed publish date'}</label>
            <input
              type="date"
              name="publish_date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              className="w-full p-2.5 border rounded-xl bg-gray-50 text-gray-900 text-sm"
            />
          </div>

          {/* File picker */}
          <div className="space-y-2">
            <label className="text-sm font-semibold">{ar ? 'الوسائط (صورة أو فيديو)' : 'Media (image or video)'}</label>
            <input
              ref={fileRef}
              name="media"
              type="file"
              accept="image/*,video/*"
              required
              onChange={onPickFile}
              className="block w-full text-sm text-gray-600 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
            />
            {preview && (
              <div className="mt-2 rounded-xl border overflow-hidden bg-black/5 dark:bg-black/30">
                {preview.isVideo ? (
                  <video src={preview.url} controls className="w-full max-h-56 object-contain bg-black" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.url} alt={preview.name} className="w-full max-h-56 object-contain bg-black" />
                )}
                <div className="px-3 py-1.5 text-[11px] text-gray-500 flex items-center gap-1.5">
                  {preview.isVideo ? <Film className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
                  <span className="truncate">{preview.name}</span>
                </div>
              </div>
            )}
            <p className="text-[11px] text-gray-500">
              {ar ? 'الحد الأقصى ٥٠ ميجابايت. JPG / PNG / WEBP / MP4 / MOV.' : 'Max 50MB. JPG / PNG / WEBP / MP4 / MOV.'}
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
          {okMessage && (
            <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
              {okMessage}
            </div>
          )}

          <div className="pt-2 flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={reset} disabled={submitting}>
              {ar ? 'إلغاء' : 'Cancel'}
            </Button>
            <Button type="submit" className="flex-1 bg-primary text-white" disabled={submitting}>
              {submitting ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {ar ? 'جاري الإرسال…' : 'Submitting…'}</>
              ) : (
                <><Send className="h-4 w-4 mr-2" /> {ar ? 'إرسال للمراجعة' : 'Submit for Review'}</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
