'use client'

import { useRef, useState } from 'react'
import { Upload, File as FileIcon, X, Loader2, CheckCircle2 } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { registerClientFile } from '@/app/actions/files'

// Single-client variant of the FilesClient upload flow. Same pipeline
// (browser → storage, then a tiny metadata insert through the server
// action), but no client dropdown — the workspace already knows whose
// page we're on. Used by the Files tab on /clients/[id].

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
)

const BUCKET = 'agency-files'

const SUGGESTED_CATEGORIES = [
  'Branding',
  'Reports',
  'Products',
  'Contracts',
  'Creative',
  'Invoices',
  'Videos',
  'Correspondence',
  'Other',
]

function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'file'
  const ext = (dot > 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'bin'
  return `${base}.${ext}`
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function UploadFileInline({
  clientId,
  existingCategories,
}: {
  clientId: string
  existingCategories: string[]
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [done, setDone] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  function reset() {
    setOpen(false)
    setPicked(null)
    setName('')
    setCategory('')
    setError(null)
    setUploading(false)
    setDone(false)
  }

  function accept(f: File | null) {
    if (!f) return
    setPicked(f)
    if (!name) setName(f.name)
    setError(null)
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    if (!picked) { setError('Pick a file first.'); return }
    if (picked.size > 100 * 1024 * 1024) { setError('File is too large (100MB limit).'); return }

    setUploading(true)
    try {
      const safe = sanitizeFilename(picked.name)
      const path = `${clientId}/${Date.now()}-${safe}`

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, picked, {
          contentType: picked.type || 'application/octet-stream',
          upsert: false,
        })
      if (upErr) { setError(`Upload failed: ${upErr.message}`); return }

      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      const storage_path = pub?.publicUrl ?? path
      const ext = (picked.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'

      const result = await registerClientFile({
        client_id: clientId,
        category: category || 'Other',
        name: name || picked.name,
        file_type: ext,
        size: picked.size,
        storage_path,
      })

      if (!result.ok) {
        // Orphan-cleanup: drop the just-uploaded object so storage stays tidy.
        await supabase.storage.from(BUCKET).remove([path]).catch(() => null)
        setError(result.error)
        return
      }

      setDone(true)
      // Server-action revalidated /clients/[id]; force a reload so the
      // list re-renders with the new row instead of leaving stale SSR.
      setTimeout(() => window.location.reload(), 600)
    } catch (err: any) {
      setError(err?.message ?? 'Unexpected error')
    } finally {
      setUploading(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary btn-sm">
        <Upload className="h-4 w-4" /> Upload file
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-[hsl(var(--card))] w-full max-w-md rounded-2xl shadow-2xl border border-[hsl(var(--border))] overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-[hsl(var(--border))]">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Upload className="h-4 w-4 text-[hsl(var(--primary))]" /> Upload file
          </h2>
          <button onClick={reset} className="text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" disabled={uploading}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-5 space-y-4">
          {/* Drop / pick zone */}
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault() }}
            onDrop={(e) => { e.preventDefault(); accept(e.dataTransfer.files?.[0] ?? null) }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
              picked
                ? 'border-emerald-500 bg-emerald-50/30 dark:bg-emerald-900/10'
                : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.03)]'
            }`}
          >
            {picked ? (
              <div className="flex items-center justify-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                  <FileIcon className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="text-left">
                  <p className="font-bold text-sm">{picked.name}</p>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(picked.size)}</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="h-12 w-12 bg-[hsl(var(--muted))] rounded-full flex items-center justify-center mb-2">
                  <Upload className="h-6 w-6 text-[hsl(var(--primary))]" />
                </div>
                <p className="font-semibold text-sm">Click or drop a file</p>
                <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-1">Up to 100MB · any file type</p>
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              onChange={(e) => accept(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
          </div>

          {/* Display name */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--muted-foreground))]">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={picked?.name ?? 'optional — defaults to the file name'}
              className="form-input"
              disabled={uploading}
            />
          </div>

          {/* Category */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider font-bold text-[hsl(var(--muted-foreground))]">Category</label>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              list="upload-file-cats"
              placeholder="Branding · Reports · Contract · …"
              className="form-input"
              maxLength={80}
              disabled={uploading}
            />
            <datalist id="upload-file-cats">
              {existingCategories.map((c) => <option key={`e-${c}`} value={c} />)}
              {SUGGESTED_CATEGORIES.filter((c) => !existingCategories.includes(c)).map((c) => (
                <option key={`s-${c}`} value={c} />
              ))}
            </datalist>
          </div>

          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-600">{error}</div>
          )}
          {done && (
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-600 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Uploaded — refreshing…
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={reset}
              disabled={uploading}
              className="btn btn-secondary flex-1"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !picked || done}
              className="btn btn-primary flex-1"
            >
              {uploading ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
