'use client'

import { useState, useRef } from 'react'
import { Upload, Folder, Trash2, Download, File, FileText, Image, Film, Search, Plus } from 'lucide-react'
import { createClient } from '@supabase/supabase-js'

const supabaseBrowserClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'your-anon-key')

interface FileRecord {
  id: string
  client_id: string
  name: string
  category: string
  size: number
  file_type: string
  storage_path: string
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
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [formData, setFormData] = useState({ name: '', category: 'Branding', client_id: '' })
  const fileRef = useRef<HTMLInputElement>(null)

  const categories = ['Branding', 'Reports', 'Products', 'Contracts', 'Creative', 'Other']

  const filtered = files.filter(f => {
    const searchMatch = !search || f.name.toLowerCase().includes(search.toLowerCase())
    const clientMatch = !filterClient || f.client_id === filterClient
    const catMatch = !filterCategory || f.category === filterCategory
    return searchMatch && clientMatch && catMatch
  })

  const findClient = (id: string) => clients.find(c => c.id === id)?.company_name || '—'

  const totalSize = files.reduce((acc, f) => acc + (f.size || 0), 0)

  const handleUpload = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!formData.name.trim() || !formData.client_id || !fileRef.current?.files?.[0]) {
      alert('Please select a file and fill in all required fields.')
      return
    }

    setUploading(true)
    try {
      const file = fileRef.current.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}_${Date.now()}.${fileExt}`
      const filePath = `client_${formData.client_id}/${fileName}`

      // Real upload to Supabase
      const { data: uploadData, error: uploadError } = await supabaseBrowserClient.storage
        .from('agency-files')
        .upload(filePath, file)

      if (uploadError) {
        console.error("Storage upload error:", uploadError)
        alert('Upload failed: ' + uploadError.message)
        return
      }

      const { data: { publicUrl } } = supabaseBrowserClient.storage.from('agency-files').getPublicUrl(filePath)

      const res = await fetch('/api/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          category: formData.category,
          client_id: formData.client_id,
          size: file.size,
          file_type: fileExt || 'file',
          storage_path: publicUrl,
        }),
      })
      if (res.ok) {
        setShowUpload(false)
        setFormData({ name: '', category: 'Branding', client_id: '' })
        window.location.reload()
      }
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (file: FileRecord) => {
    if (!confirm(`Delete "${file.name}"? This cannot be undone.`)) return
    await fetch(`/api/files/${file.id}`, { method: 'DELETE' })
    window.location.reload()
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="section-header">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Files & Assets</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))] mt-0.5">Central repository for client documents and media</p>
        </div>
        <button onClick={() => setShowUpload(true)} className="btn btn-primary">
          <Upload className="h-4 w-4" /> Upload File
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="text-2xl font-bold">{files.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Total Files</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold">{clients.length}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Client Folders</div>
        </div>
        <div className="stat-card">
          <div className="text-2xl font-bold">{formatBytes(totalSize)}</div>
          <div className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Total Size</div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            className="form-input pl-10" placeholder="Search files..."
            value={search} onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="form-input w-auto" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">All Clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        <select className="form-input w-auto" value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Files Table */}
      <div className="premium-card overflow-hidden">
        <table className="w-full data-table">
          <thead>
            <tr>
              <th className="text-left">File</th>
              <th className="text-left">Client</th>
              <th className="text-left">Category</th>
              <th className="text-left">Size</th>
              <th className="text-left">Date</th>
              <th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="py-16 text-center">
                  <Folder className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-[hsl(var(--muted-foreground))]">No files found</p>
                  <button onClick={() => setShowUpload(true)} className="btn btn-primary mt-4">
                    <Upload className="h-4 w-4" /> Upload First File
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
                    <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">{file.category}</span>
                  </td>
                  <td>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">{formatBytes(file.size || 0)}</span>
                  </td>
                  <td>
                    <span className="text-xs text-[hsl(var(--muted-foreground))]">
                      {new Date(file.created_at).toLocaleDateString()}
                    </span>
                  </td>
                  <td className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <a href={file.storage_path} download className="btn btn-ghost btn-xs text-[hsl(var(--primary))]">
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

      {/* Upload Modal (PRO Level Context) */}
      {showUpload && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowUpload(false)}>
          <div className="modal-content max-w-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold flex items-center gap-2"><Upload className="h-5 w-5 text-[hsl(var(--primary))]" /> Advanced Media Engine</h2>
            </div>
            
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="form-group">
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all ${
                    formData.name ? 'border-emerald-500 bg-emerald-50/20 dark:bg-emerald-900/10' : 'border-[hsl(var(--border))] hover:border-[hsl(var(--primary)/0.5)] hover:bg-[hsl(var(--primary)/0.02)]'
                  }`}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50/50') }}
                  onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50') }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50/50');
                    const f = e.dataTransfer.files?.[0];
                    if (f) setFormData(prev => ({ ...prev, name: f.name }));
                  }}
                >
                  {formData.name ? (
                     <div className="flex flex-col items-center gap-3 animate-slide-up">
                       <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center shadow-inner">
                         <File className="h-8 w-8" />
                       </div>
                       <div>
                         <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400">{formData.name}</p>
                         <p className="text-xs text-emerald-600">File ready for encryption & pipeline injection</p>
                       </div>
                     </div>
                  ) : (
                     <div className="flex flex-col items-center">
                       <div className="h-16 w-16 bg-[hsl(var(--muted))] rounded-full flex items-center justify-center mb-3">
                         <Upload className="h-8 w-8 text-[hsl(var(--primary))]" />
                       </div>
                       <p className="text-lg font-bold">Drag & Drop Media Element</p>
                       <p className="text-sm text-[hsl(var(--muted-foreground))] mt-1">Supports ultra-high resolution up to 4K / 2GB limits</p>
                     </div>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) setFormData(prev => ({ ...prev, name: f.name }))
                    }}
                  />
                </div>
              </div>
              
              <div className="bg-[hsl(var(--card))] border border-[hsl(var(--border))] p-4 rounded-xl space-y-4 shadow-sm">
                <div className="grid grid-cols-2 gap-4">
                  <div className="form-group">
                    <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Client Assignment</label>
                    <select
                      className="form-input bg-transparent font-semibold border-b-2 border-t-0 border-l-0 border-r-0 border-[hsl(var(--border))] rounded-none px-0 focus:ring-0 focus:border-[hsl(var(--primary))]"
                      value={formData.client_id}
                      onChange={e => setFormData(prev => ({ ...prev, client_id: e.target.value }))}
                      required
                    >
                      <option value="">Link to Client DB...</option>
                      {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label text-xs uppercase tracking-wider text-[hsl(var(--muted-foreground))]">Asset Category</label>
                    <select
                      className="form-input bg-transparent font-semibold border-b-2 border-t-0 border-l-0 border-r-0 border-[hsl(var(--border))] rounded-none px-0 focus:ring-0 focus:border-[hsl(var(--primary))]"
                      value={formData.category}
                      onChange={e => setFormData(prev => ({ ...prev, category: e.target.value }))}
                    >
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-4">
                <button type="button" onClick={() => setShowUpload(false)} className="btn btn-secondary px-6">Cancel</button>
                <button type="submit" disabled={uploading || !formData.name} className="btn btn-primary px-8 shadow-xl shadow-blue-500/20">
                  {uploading ? 'Processing...' : 'Secure Upload & Link'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
