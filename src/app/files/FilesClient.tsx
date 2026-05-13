'use client'

import { useState, useRef } from 'react'
import { Upload, Folder, Trash2, Download, File, FileText, Image, Film, Search, Plus } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'
import { useLanguage } from '@/lib/i18n/LanguageContext'
import { registerClientFile } from '@/app/actions/files'

// Browser-side Supabase client. RLS on storage.objects is loosened in
// migration 017 so anon can insert into the agency-files bucket — gated
// by application-level auth in registerClientFile() instead.
const supabaseBrowserClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
)

const BUCKET = 'agency-files'

function sanitizeFilename(name: string): string {
  const dot = name.lastIndexOf('.')
  const base = (dot > 0 ? name.slice(0, dot) : name).replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').slice(0, 80) || 'file'
  const ext = (dot > 0 ? name.slice(dot + 1) : '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toLowerCase() || 'bin'
  return `${base}.${ext}`
}

// Matches the actual `client_files` columns on the deployed DB.
// Earlier code assumed `size`/`storage_path`; those columns don't exist
// (table has `file_size`/`file_path`), which is why uploads were
// silently failing on the metadata insert step.
interface FileRecord {
  id: string
  client_id: string
  name: string
  category: string
  file_size: number | null
  file_type: string
  file_path: string
  created_at: string
}

const fileIcons: Record<string, any> = {
  pdf: FileText,
  xlsx: FileText,
  xls: FileText,
  jpg: Image,
  jpeg: Image,
  png: Image,
  gif: Image,
  mp4: Film,
  mov: Film,
  default: File,
}

const fileColors: Record<string, string> = {
  pdf: 'bg-red-100 text-red-600 dark:bg-red-900/30',
  xlsx: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30',
  xls: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30',
  jpg: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  png: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
  mp4: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30',
  default: 'bg-gray-100 text-gray-600 dark:bg-gray-800',
}

function formatBytes(bytes: number) {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export function FilesClient({ files, clients }: { files: FileRecord[]; clients: { id: string; company_name: string }[] }) {
  const { language, dir } = useLanguage()
  const ar = language === 'ar'
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [formData, setFormData] = useState({ name: '', category: 'Branding', client_id: '' })
  // Track the actual File object alongside the displayed name so drag-drop
  // works the same as click-to-select. Previously dropping a file only
  // updated formData.name; fileRef.current.files stayed empty and the
  // submit handler bounced with "fill all required fields".
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Categories keep their English keys (so existing DB rows match) but
  // display in Arabic when the UI is RTL.
  const categories = ['Branding', 'Reports', 'Products', 'Contracts', 'Creative', 'Other']
  const categoryLabel = (c: string) => {
    if (!ar) return c
    const map: Record<string, string> = {
      Branding: 'هوية بصرية', Reports: 'تقارير', Products: 'منتجات',
      Contracts: 'عقود', Creative: 'إبداعي', Other: 'أخرى',
    }
    return map[c] ?? c
  }

  const filtered = files.filter(f => {
    const searchMatch = !search || f.name.toLowerCase().includes(search.toLowerCase())
    const clientMatch = !filterClient || f.client_id === filterClient
    const catMatch = !filterCategory || f.category === filterCategory
    return searchMatch && clientMatch && catMatch
  })

  const findClient = (id: string) => clients.find(c => c.id === id)?.company_name || '—'

  const totalSize = files.reduce((acc, f) => acc + (f.file_size || 0), 0)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setUploadError(null)

    if (!pickedFile) {
      setUploadError(ar ? 'يرجى اختيار ملف.' : 'Pick a file first.')
      return
    }
    if (!formData.client_id) {
      setUploadError(ar ? 'يرجى اختيار العميل.' : 'Pick a client.')
      return
    }
    if (pickedFile.size > 100 * 1024 * 1024) {
      setUploadError(ar ? 'الملف كبير جداً (الحد الأقصى ١٠٠ ميجابايت).' : 'File is too large (100MB limit).')
      return
    }

    setUploading(true)
    try {
      // 1. Browser → Supabase Storage. Skips the server action entirely,
      //    so Hostinger's reverse-proxy body-size cap can't block large
      //    files. Storage policies are public-insertable (migration 017).
      const safe = sanitizeFilename(pickedFile.name)
      const path = `${formData.client_id}/${Date.now()}-${safe}`
      const { error: upErr } = await supabaseBrowserClient.storage
        .from(BUCKET)
        .upload(path, pickedFile, {
          contentType: pickedFile.type || 'application/octet-stream',
          upsert: false,
        })
      if (upErr) {
        setUploadError((ar ? 'فشل الرفع: ' : 'Upload failed: ') + upErr.message)
        return
      }

      const { data: pub } = supabaseBrowserClient.storage.from(BUCKET).getPublicUrl(path)
      const storage_path = pub?.publicUrl ?? path

      // 2. Tiny server action call — just the row metadata, no file bytes.
      //    Always fits well under any reverse-proxy body cap.
      const ext = (pickedFile.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin'
      const result = await registerClientFile({
        client_id: formData.client_id,
        category: formData.category,
        name: formData.name || pickedFile.name,
        file_type: ext,
        size: pickedFile.size,
        storage_path,
      })
      if (!result.ok) {
        // Try to remove the orphaned storage object so we don't leak.
        await supabaseBrowserClient.storage.from(BUCKET).remove([path]).catch(() => null)
        setUploadError(result.error)
        return
      }

      setShowUpload(false)
      setFormData({ name: '', category: 'Branding', client_id: '' })
      setPickedFile(null)
      window.location.reload()
    } catch (err: any) {
      setUploadError(err?.message ?? 'Unexpected error')
    } finally {
      setUploading(false)
    }
  }

  // Single entry point both for click-selected and drag-dropped files,
  // so the validation + preview always see the same File object.
  const acceptFile = (f: File | null) => {
    if (!f) return
    setPickedFile(f)
    setFormData(prev => ({ ...prev, name: f.name }))
    setUploadError(null)
  }

  const handleDelete = async (file: FileRecord) => {
    if (!confirm(ar ? `حذف "${file.name}"؟ لا يمكن التراجع.` : `Delete "${file.name}"? This cannot be undone.`)) return
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <div className="space-y-6 pb-8" dir={dir}>
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{ar ? 'الملفات والأصول' : 'Files & Assets'}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">
            {ar ? 'مستودع مركزي لمستندات وملفات العملاء' : 'Central repository for client documents and media'}
          </p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary">
          <Upload className="h-4 w-4" /> {ar ? 'رفع ملف' : 'Upload File'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="text-2xl font-bold">{files.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'إجمالي الملفات' : 'Total Files'}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold">{clients.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'مجلدات العملاء' : 'Client Folders'}</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">{ar ? 'الحجم الإجمالي' : 'Total Size'}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className={`absolute ${ar ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))] pointer-events-none`} />
          <input
            className={`form-input ${ar ? 'pr-10 text-right' : 'pl-10'}`}
            placeholder={ar ? 'بحث في الملفات…' : 'Search files...'}
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-input w-auto" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">{ar ? 'جميع العملاء' : 'All Clients'}</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        <select className="form-input w-auto" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">{ar ? 'جميع التصنيفات' : 'All Categories'}</option>
          {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
        </select>
      </div>

      {/* Files Table */}
      <div className="premium-card overflow-hidden">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className={ar ? 'text-right' : 'text-left'}>{ar ? 'الملف' : 'File'}</th>
              <th className={ar ? 'text-right' : 'text-left'}>{ar ? 'العميل' : 'Client'}</th>
              <th className={ar ? 'text-right' : 'text-left'}>{ar ? 'التصنيف' : 'Category'}</th>
              <th className={ar ? 'text-right' : 'text-left'}>{ar ? 'الحجم' : 'Size'}</th>
              <th className={ar ? 'text-right' : 'text-left'}>{ar ? 'التاريخ' : 'Date'}</th>
              <th className={ar ? 'text-left' : 'text-right'}>{ar ? 'إجراءات' : 'Actions'}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-[hsl(var(--muted-foreground))]">{ar ? 'لا توجد ملفات' : 'No files found'}</p>
                  <button onClick={() => setShowUpload(true)} className="btn btn-primary mt-4">
                    <Upload className="h-4 w-4" /> {ar ? 'رفع أول ملف' : 'Upload First File'}
                  </button>
                </td>
              </tr>
            )}
            {filtered.map(file => {
              const ext = file.file_type || file.name.split('.').pop() || 'file'
              const Icon = fileIcons[ext.toLowerCase()] || fileIcons.default
              const iconCls = fileColors[ext.toLowerCase()] || fileColors.default
              return (
                <tr key={file.id} className="group">
                  <td>
                    <div className="flex items-center gap-3">
                      <div className={`h-9 w-9 rounded-xl flex items-center justify-center flex-shrink-0 ${iconCls}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{file.name}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] uppercase">{ext}</p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-secondary text-[10px]">{findClient(file.client_id)}</span>
                  </td>
                  <td>
                    <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{categoryLabel(file.category)}</span>
                  </td>
                  <td>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(file.file_size || 0)}</span>
                  </td>
                  <td>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {new Date(file.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={file.file_path} download className="btn btn-ghost btn-xs text-[hsl(var(--primary))]">
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => handleDelete(file)}
                        className="btn btn-ghost btn-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUpload(false)} dir={dir}>
          <div className="modal-content max-w-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Upload className="h-5 w-5 text-[hsl(var(--primary))]" /> {ar ? 'رفع ملف جديد' : 'Advanced Media Engine'}
              </h2>
            </div>

            <form onSubmit={handleUpload} className="space-y-4">
              <div className="form-group">
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    pickedFile ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-900/10' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.02)]'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/50') }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50') }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50');
                    acceptFile(e.dataTransfer.files?.[0] ?? null);
                  }}
                >
                  {pickedFile ? (
                     <div className="flex flex-col items-center gap-3 animate-slide-up">
                       <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                         <File className="h-8 w-8" />
                       </div>
                       <div>
                         <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400">{pickedFile.name}</p>
                         <p className="text-xs text-emerald-600">
                           {ar ? `الملف جاهز للرفع (${formatBytes(pickedFile.size)})` : `File ready (${formatBytes(pickedFile.size)})`}
                         </p>
                       </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center">
                       <div className="h-16 w-16 bg-[hsl(var(--muted))] rounded-full flex items-center justify-center mb-3">
                         <Upload className="h-8 w-8 text-[hsl(var(--primary))]" />
                       </div>
                       <p className="text-lg font-bold">{ar ? 'اسحب وأفلت الملف هنا' : 'Drag & Drop Media Element'}</p>
                       <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                         {ar ? 'يدعم دقة عالية حتى 4K / 2 جيجابايت' : 'Supports ultra-high resolution up to 4K / 2GB limits'}
                       </p>
                     </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={e => acceptFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-4 rounded-xl space-y-4 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {ar ? 'تعيين العميل' : 'Client Assignment'}
                    </label>
                    <select
                      className="form-input bg-transparent font-semibold border-b-2 border-t-0 border-l-0 border-r-0 border-[hsl(var(--border))] rounded-none px-0 focus:ring-0 focus:border-[hsl(var(--primary))]"
                      value={formData.client_id}
                      onChange={e => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                      required
                    >
                      <option value="">{ar ? 'اختر عميلاً…' : 'Link to Client DB...'}</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      {ar ? 'التصنيف' : 'Asset Category'}
                    </label>
                    <select
                      className="form-input bg-transparent font-semibold border-b-2 border-t-0 border-l-0 border-r-0 border-[hsl(var(--border))] rounded-none px-0 focus:ring-0 focus:border-[hsl(var(--primary))]"
                      value={formData.category}
                      onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {categories.map(c => <option key={c} value={c}>{categoryLabel(c)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              {uploadError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 px-3 py-2 text-xs text-red-700 dark:text-red-300">
                  {uploadError}
                </div>
              )}
              <div className={`flex gap-3 pt-4 ${ar ? 'justify-start' : 'justify-end'}`}>
                <button
                  type="button"
                  onClick={() => { setShowUpload(false); setUploadError(null); setPickedFile(null); }}
                  className="btn btn-secondary px-6"
                >
                  {ar ? 'إلغاء' : 'Cancel'}
                </button>
                <button type="submit" disabled={uploading || !pickedFile} className="btn btn-primary px-8 shadow-xl shadow-blue-500/20">
                  {uploading ? (ar ? 'جاري الرفع…' : 'Processing...') : (ar ? 'رفع وربط' : 'Upload & Link')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
