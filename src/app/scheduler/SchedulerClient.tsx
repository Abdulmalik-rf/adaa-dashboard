'use client'

import { useState } from 'react'
import {
  Plus, Calendar, List, LayoutGrid, Filter, CheckCircle2, Clock,
  Video, Image, FileText, Zap, Camera, Target, AlertCircle, Trash2
} from 'lucide-react'
import { markTaskCompleted, deleteTask } from '@/app/actions/tasks'
import Link from 'next/link'

interface ContentItem {
  id: string
  client_id: string
  platform: string
  content_type: string
  title: string
  caption: string
  hashtags?: string
  publish_date: string
  publish_time: string
  timezone?: string
  schedule_status: string
  task_status: string
  assignee_id?: string
}

const platformConfig: Record<string, { label: string; cls: string; icon: string }> = {
  instagram: { label: 'Instagram', cls: 'badge-platform-instagram', icon: '📸' },
  tiktok: { label: 'TikTok', cls: 'badge-platform-tiktok', icon: '🎬' },
  snapchat: { label: 'Snapchat', cls: 'badge-platform-snapchat', icon: '👻' },
  google_ads: { label: 'Google Ads', cls: 'badge-platform-google_ads', icon: '🎯' },
}

const scheduleStatusConfig: Record<string, { cls: string; label: string }> = {
  draft: { cls: 'bg-gray-100 text-gray-700', label: 'Draft' },
  review: { cls: 'bg-indigo-100 text-indigo-700', label: 'In Review' },
  approved: { cls: 'bg-emerald-100 text-emerald-700', label: 'Approved' },
  scheduled: { cls: 'bg-blue-100 text-blue-700', label: 'Scheduled' },
  published: { cls: 'bg-purple-100 text-purple-700', label: 'Published' },
}

const taskStatusConfig: Record<string, { cls: string; label: string }> = {
  not_started: { cls: 'bg-gray-100 text-gray-700', label: 'Not Started' },
  in_progress: { cls: 'bg-amber-100 text-amber-700', label: 'In Progress' },
  completed: { cls: 'bg-emerald-100 text-emerald-700', label: 'Completed' },
}

interface Props {
  contentItems: ContentItem[]
  teamMembers: { id: string; full_name: string }[]
  clients: { id: string; company_name: string }[]
  initialPlatform: string
  initialStatus: string
  initialView: string
}

function ContentCard({ item, findClient, findMember, onStatusUpdate }: {
  item: ContentItem
  findClient: (id: string) => string
  findMember: (id: string) => string
  onStatusUpdate: (id: string, status: string) => void
}) {
  const pc = platformConfig[item.platform] || { label: item.platform, cls: 'badge-secondary', icon: '📋' }
  const sc = scheduleStatusConfig[item.schedule_status] || { cls: 'badge-secondary', label: item.schedule_status }
  const tc = taskStatusConfig[item.task_status] || { cls: 'badge-secondary', label: item.task_status }

  const nextApproval: Record<string, string> = {
    draft: 'review',
    review: 'approved',
    approved: 'scheduled',
  }

  const nextTask: Record<string, string> = {
    not_started: 'in_progress',
    in_progress: 'completed',
  }

  return (
    <div className="premium-card p-5 space-y-4 group hover:shadow-lg transition-all">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge text-[10px] ${pc.cls}`}>{pc.icon} {pc.label}</span>
          <span className={`badge text-[10px] ${sc.cls}`}>{sc.label}</span>
        </div>
        <span className={`badge text-[10px] ${tc.cls}`}>{tc.label}</span>
      </div>

      <div>
        <h3 className="font-bold text-sm">{item.title}</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))] mt-1 line-clamp-2">{item.caption}</p>
        {item.hashtags && (
          <p className="text-xs text-[hsl(var(--primary))] mt-1 line-clamp-1">{item.hashtags}</p>
        )}
      </div>

      <div className="flex items-center justify-between text-xs text-[hsl(var(--muted-foreground))] border-t border-[hsl(var(--border))] pt-3">
        <div className="space-y-0.5">
          <p className="font-medium">{findClient(item.client_id)}</p>
          <p>By {findMember(item.assignee_id || '')}</p>
        </div>
        <div className="text-right">
          <p className="font-medium">{item.publish_date}</p>
          <p>{item.publish_time} {item.timezone ? `(${item.timezone.split('/')[1]})` : ''}</p>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {nextApproval[item.schedule_status] && (
          <button
            onClick={() => onStatusUpdate(item.id, nextApproval[item.schedule_status])}
            className="btn btn-xs btn-secondary flex-1"
          >
            Move to {scheduleStatusConfig[nextApproval[item.schedule_status]]?.label}
          </button>
        )}
        {item.task_status !== 'completed' && nextTask[item.task_status] && (
          <form action={markTaskCompleted.bind(null, item.id, 'content', 'completed')}>
            <button type="submit" className="btn btn-xs btn-primary">
              <CheckCircle2 className="h-3 w-3" />
              {item.task_status === 'in_progress' ? 'Complete' : 'Start'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function SchedulerClient({ contentItems, teamMembers, clients, initialPlatform, initialStatus, initialView }: Props) {
  const [platform, setPlatform] = useState(initialPlatform)
  const [statusFilter, setStatusFilter] = useState(initialStatus)
  const [view, setView] = useState(initialView)
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [items, setItems] = useState(contentItems)
  const [search, setSearch] = useState('')

  const findClient = (id: string) => clients.find(c => c.id === id)?.company_name || '—'
  const findMember = (id: string) => teamMembers.find(m => m.id === id)?.full_name || 'Unassigned'

  const filtered = items.filter(item => {
    const pMatch = platform === 'all' || item.platform === platform
    const sMatch = statusFilter === 'all' || item.schedule_status === statusFilter
    const qMatch = !search || item.title?.toLowerCase().includes(search.toLowerCase()) || item.caption?.toLowerCase().includes(search.toLowerCase())
    return pMatch && sMatch && qMatch
  })

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    const res = await fetch(`/api/content/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule_status: newStatus }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === id ? { ...i, schedule_status: newStatus } : i))
    }
  }

  const handleCreate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSaving(true)
    const fd = new FormData(e.currentTarget)
    const data = Object.fromEntries(fd)
    try {
      const res = await fetch('/api/content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, task_status: 'not_started' }),
      })
      if (res.ok) {
        const { data: result } = await res.json()
        if (result?.length > 0) {
          setItems(prev => [result[0], ...prev])
        }
        setShowModal(false)
      }
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id))
    await fetch(`/api/content/${id}`, { method: 'DELETE' })
  }

  const platforms = ['all', 'instagram', 'tiktok', 'snapchat', 'google_ads']
  const statuses = ['all', 'draft', 'review', 'approved', 'scheduled', 'published']

  // Calendar view: group by date
  const byDate = filtered.reduce((acc: Record<string, ContentItem[]>, item) => {
    if (!acc[item.publish_date]) acc[item.publish_date] = []
    acc[item.publish_date].push(item)
    return acc
  }, {})

  const statsMap = {
    draft: items.filter(i => i.schedule_status === 'draft').length,
    review: items.filter(i => i.schedule_status === 'review').length,
    approved: items.filter(i => i.schedule_status === 'approved').length,
    scheduled: items.filter(i => i.schedule_status === 'scheduled').length,
    published: items.filter(i => i.schedule_status === 'published').length,
  }

  return (
    <div className="space-y-6 pb-8">
      {/* Premium Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <Calendar className="h-7 w-7 text-pink-500" /> Content Scheduler
          </h1>
          <p className="text-[hsl(var(--muted-foreground))] mt-1 font-medium">
            {items.length} content items across all platforms & clients
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/scheduler/new">
            <button className="btn btn-secondary flex items-center gap-2">
              <Zap className="h-4 w-4" /> Studio
            </button>
          </Link>
          <button onClick={() => setShowModal(true)} className="btn btn-primary shadow-lg shadow-pink-500/20 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Schedule Content
          </button>
        </div>
      </div>

      {/* Pipeline Stats — clickable status cards */}
      <div className="grid grid-cols-5 gap-3">
        {(Object.entries(statsMap) as [string, number][]).map(([status, count]) => {
          const sc = scheduleStatusConfig[status]
          const isActive = statusFilter === status
          const colors: Record<string, string> = {
            draft: 'border-l-slate-400', review: 'border-l-indigo-500',
            approved: 'border-l-emerald-500', scheduled: 'border-l-blue-500', published: 'border-l-purple-500'
          }
          return (
            <button
              key={status}
              onClick={() => setStatusFilter(isActive ? 'all' : status)}
              className={`premium-card p-4 text-center cursor-pointer border-l-4 transition-all hover:shadow-md ${colors[status] || ''} ${isActive ? 'ring-2 ring-[hsl(var(--primary))] ring-offset-1' : ''}`}
            >
              <div className="text-2xl font-black">{count}</div>
              <div className="text-xs text-[hsl(var(--muted-foreground))] mt-1 font-semibold">{sc?.label || status}</div>
            </button>
          )
        })}
      </div>

      {/* Platform tabs + View toggle */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="tab-list flex-wrap">
          {platforms.map(p => (
            <button key={p} onClick={() => setPlatform(p)} className={`tab-item capitalize ${platform === p ? 'tab-item-active' : ''}`}>
              {platformConfig[p]?.icon} {p === 'all' ? 'All' : platformConfig[p]?.label || p}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="tab-list">
            <button onClick={() => setView('list')} className={`tab-item ${view === 'list' ? 'tab-item-active' : ''}`}>
              <List className="h-4 w-4 inline mr-1" />List
            </button>
            <button onClick={() => setView('grid')} className={`tab-item ${view === 'grid' ? 'tab-item-active' : ''}`}>
              <LayoutGrid className="h-4 w-4 inline mr-1" />Grid
            </button>
            <button onClick={() => setView('calendar')} className={`tab-item ${view === 'calendar' ? 'tab-item-active' : ''}`}>
              <Calendar className="h-4 w-4 inline mr-1" />Calendar
            </button>
          </div>
        </div>
      </div>

      {/* Search + Status Filter Bar */}
      <div className="premium-card p-4 flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1 w-full">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--muted-foreground))]" />
          <input
            type="text"
            placeholder="Search content by title or caption..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="form-input pl-10 w-full rounded-full text-sm"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {statuses.map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? 'all' : s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${statusFilter === s ? 'bg-[hsl(var(--primary))] text-white border-[hsl(var(--primary))]' : 'border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:border-[hsl(var(--primary))] hover:text-[hsl(var(--primary))]'}`}>
              {s === 'all' ? 'All Status' : scheduleStatusConfig[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Content Views */}
      {filtered.length === 0 && (
        <div className="premium-card p-16 text-center">
          <Calendar className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-[hsl(var(--muted-foreground))]">No content matches this filter</p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary mt-4"><Plus className="h-4 w-4" /> Create Content</button>
        </div>
      )}

      {/* Grid view */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(item => (
            <ContentCard key={item.id} item={item} findClient={findClient} findMember={findMember} onStatusUpdate={handleStatusUpdate} />
          ))}
        </div>
      )}

      {/* List view */}
      {view === 'list' && filtered.length > 0 && (
        <div className="premium-card overflow-hidden">
          <table className="w-full data-table">
            <thead>
              <tr>
                <th className="text-left">Content</th>
                <th className="text-left">Platform</th>
                <th className="text-left">Client</th>
                <th className="text-left">Assigned To</th>
                <th className="text-left">Schedule</th>
                <th className="text-left">Status</th>
                <th className="text-left">Task</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(item => {
                const pc = platformConfig[item.platform] || { label: item.platform, cls: 'badge-secondary', icon: '📋' }
                const sc = scheduleStatusConfig[item.schedule_status] || { cls: 'badge-secondary', label: item.schedule_status }
                const tc = taskStatusConfig[item.task_status] || { cls: 'badge-secondary', label: item.task_status }
                const nextApproval: Record<string, string> = { draft: 'review', review: 'approved', approved: 'scheduled' }
                return (
                  <tr key={item.id} className="group">
                    <td>
                      <div>
                        <p className="font-semibold text-sm">{item.title}</p>
                        <p className="text-xs text-[hsl(var(--muted-foreground))] truncate max-w-[200px]">{item.caption?.slice(0, 50)}</p>
                      </div>
                    </td>
                    <td><span className={`badge text-[10px] ${pc.cls}`}>{pc.icon} {pc.label}</span></td>
                    <td><span className="text-xs">{findClient(item.client_id)}</span></td>
                    <td><span className="text-xs">{findMember(item.assignee_id || '')}</span></td>
                    <td>
                      <p className="text-xs font-medium">{item.publish_date}</p>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.publish_time}</p>
                    </td>
                    <td><span className={`badge text-[10px] ${sc.cls}`}>{sc.label}</span></td>
                    <td><span className={`badge text-[10px] ${tc.cls}`}>{tc.label}</span></td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {nextApproval[item.schedule_status] && (
                          <button onClick={() => handleStatusUpdate(item.id, nextApproval[item.schedule_status])} className="btn btn-xs btn-secondary">
                            Advance
                          </button>
                        )}
                        {item.task_status !== 'completed' && (
                          <form action={markTaskCompleted.bind(null, item.id, 'content', 'completed')}>
                            <button type="submit" className="btn btn-xs btn-primary"><CheckCircle2 className="h-3 w-3" /></button>
                          </form>
                        )}
                        <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-xs text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
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
      )}

      {/* Calendar view */}
      {view === 'calendar' && filtered.length > 0 && (
        <div className="space-y-4">
          {Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => (
            <div key={date} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-[hsl(var(--primary))] text-white flex flex-col items-center justify-center flex-shrink-0">
                  <span className="text-[10px] font-bold">{new Date(date + 'T00:00:00').toLocaleString('en', { month: 'short' }).toUpperCase()}</span>
                  <span className="text-base font-bold leading-none">{new Date(date + 'T00:00:00').getDate()}</span>
                </div>
                <div className="h-px flex-1 bg-[hsl(var(--border))]" />
                <span className="text-xs font-bold text-[hsl(var(--muted-foreground))]">{items.length} item{items.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 pl-14">
                {items.map(item => (
                  <ContentCard key={item.id} item={item} findClient={findClient} findMember={findMember} onStatusUpdate={handleStatusUpdate} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal-content modal-content-lg">
            <h2 className="text-xl font-bold mb-6">Schedule New Content</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Platform</label>
                  <select name="platform" className="form-input" required>
                    <option value="instagram">Instagram</option>
                    <option value="tiktok">TikTok</option>
                    <option value="snapchat">Snapchat</option>
                    <option value="google_ads">Google Ads</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Content Type</label>
                  <select name="content_type" className="form-input">
                    <option value="post">Post</option>
                    <option value="reel">Reel</option>
                    <option value="story">Story</option>
                    <option value="video">Video</option>
                    <option value="ad">Ad</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Title</label>
                <input name="title" className="form-input" placeholder="Content title / concept" required />
              </div>
              <div className="form-group">
                <label className="form-label">Caption</label>
                <textarea name="caption" className="form-input" rows={3} placeholder="Post caption..." required />
              </div>
              <div className="form-group">
                <label className="form-label">Hashtags / Keywords</label>
                <input name="hashtags" className="form-input" placeholder="#hashtag1 #hashtag2..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="form-label">Publish Date</label>
                  <input name="publish_date" type="date" className="form-input" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Publish Time</label>
                  <input name="publish_time" type="time" className="form-input" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Timezone</label>
                  <select name="timezone" className="form-input">
                    <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                    <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                    <option value="Europe/London">Europe/London (GMT)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select name="schedule_status" className="form-input">
                    <option value="draft">Draft</option>
                    <option value="review">In Review</option>
                    <option value="approved">Approved</option>
                    <option value="scheduled">Scheduled</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Client</label>
                  <select name="client_id" className="form-input">
                    <option value="">No client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Assign To</label>
                  <select name="assignee_id" className="form-input">
                    <option value="">Unassigned</option>
                    {teamMembers.map(m => <option key={m.id} value={m.id}>{m.full_name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? 'Scheduling...' : '📅 Schedule Content'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
