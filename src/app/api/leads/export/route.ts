import { NextResponse, type NextRequest } from 'next/server'
import { supabaseClient } from '@/lib/supabase/client'
import { getCurrentUser } from '@/lib/supabase/server'

// Admin-only CSV export of every lead-stage row (status IN ('to_contact','lead')).
// Returns a downloadable file via Content-Disposition. UTF-8 BOM is
// prepended so Excel + Numbers auto-detect the encoding — without it
// Arabic columns render as mojibake on Windows Excel.

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  // Escape if it contains anything that would break a CSV cell.
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

function formatRelativeAge(iso: string | null): string {
  if (!iso) return 'Never'
  const diffMs = Date.now() - Date.parse(iso)
  if (Number.isNaN(diffMs)) return 'Never'
  const hours = Math.floor(diffMs / 3_600_000)
  if (hours < 1) return 'Just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export async function GET(request: NextRequest) {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') {
    return NextResponse.json({ error: 'admin only' }, { status: 403 })
  }

  // Same filter as the /leads page.
  const { data, error } = await (supabaseClient as any)
    .from('clients')
    .select('company_name, full_name, phone, whatsapp, email, city, business_type, status, last_contacted_at, notes, created_at, website_url')
    .in('status', ['to_contact', 'lead'])
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data as any[]) ?? []

  // Header row — explicit English column names. Excel reads the actual
  // cell values in any language thanks to the UTF-8 BOM below.
  const header = [
    'Company',
    'Contact Name',
    'Phone',
    'WhatsApp',
    'Email',
    'City',
    'Business Type',
    'Website',
    'Status',
    'Last Contacted (ISO)',
    'Last Contacted (Relative)',
    'Created At',
    'Notes',
  ]

  const lines: string[] = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      r.company_name,
      r.full_name,
      r.phone,
      r.whatsapp,
      r.email,
      r.city,
      r.business_type,
      r.website_url,
      r.status,
      r.last_contacted_at ?? '',
      formatRelativeAge(r.last_contacted_at),
      r.created_at,
      r.notes,
    ].map(csvCell).join(','))
  }

  // \r\n line endings — Excel on Windows is strict about this; LF-only
  // can render as one long row. The BOM (0xEF,0xBB,0xBF) sits at byte
  // position 0 so Excel reads the file as UTF-8 instead of cp1252.
  const csv = '﻿' + lines.join('\r\n')
  const today = new Date().toISOString().slice(0, 10)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="emergize-leads-${today}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
