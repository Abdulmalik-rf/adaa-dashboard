'use server'

import { agentSupabase } from '@/lib/chat-agent/supabase'
import { getCurrentUser } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// =============================================================================
// Bank statement reconciliation
//
// Workflow:
//   1. Admin uploads a bank statement PDF to Supabase Storage (browser-direct
//      upload bypasses the Hostinger reverse-proxy body cap).
//   2. ingestBankStatement(path) is called server-side. It downloads the PDF,
//      extracts text with unpdf, and parses each line into a transaction.
//   3. autoMatchTransactions() runs to link each transaction to a candidate
//      invoice (money in) or bill (money out) based on amount + date.
//   4. Admin reviews on /accounting/reconciliation and confirms matches.
//
// The parser is intentionally pragmatic: KSA bank statements are wildly
// inconsistent (SNB, Al Rajhi, Riyad, Mada PDF dumps) — we try a small
// stack of regexes and bail to "needs manual review" if nothing fits.
// =============================================================================

const BUCKET = 'content-uploads'

type ParsedTx = {
  transaction_date: string | null
  description: string
  amount: number
  balance_after: number | null
  reference: string | null
}

// Multiple date patterns. KSA banks switch between dd/MM/yyyy, dd-MM-yyyy,
// dd/MM/yy, and ISO. Hijri dates appear too — we ignore those (rows
// without a Gregorian date fall through to "unparsed").
const DATE_RE = /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/

// Money: 1,234.56 / 1234.56 / -1234.56 / (1234.56) — parentheses = debit
// in Western convention but KSA uses CR/DR labels more often.
const MONEY_RE = /[\d]{1,3}(?:,\d{3})*\.\d{2}/g

function toNumber(s: string): number {
  return Number(s.replace(/,/g, ''))
}

function normalizeDate(d: string, m: string, y: string): string | null {
  let year = parseInt(y, 10)
  if (year < 100) year = 2000 + year
  const mm = parseInt(m, 10)
  const dd = parseInt(d, 10)
  if (!mm || !dd || mm > 12 || dd > 31) return null
  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

// Try to split the raw text into per-transaction blocks. We use the
// date regex as a delimiter — every line that starts with a date is a
// new transaction. Lines that don't start with a date get appended to
// the previous transaction's description (multi-line descriptions are
// common in SNB).
function parseStatementText(raw: string): ParsedTx[] {
  const lines = raw.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
  const rows: ParsedTx[] = []
  let current: { date: string; rest: string } | null = null

  for (const line of lines) {
    const m = line.match(DATE_RE)
    if (m && m.index !== undefined && m.index < 30) {
      // New transaction. Flush previous.
      if (current) {
        const parsed = parseLine(current.date, current.rest)
        if (parsed) rows.push(parsed)
      }
      const dateStr = normalizeDate(m[1], m[2], m[3])
      if (dateStr) {
        current = { date: dateStr, rest: line.slice((m.index || 0) + m[0].length).trim() }
      } else {
        current = null
      }
    } else if (current) {
      // Continuation of the previous tx's description (multi-line)
      current.rest = `${current.rest} ${line}`.trim()
    }
  }
  if (current) {
    const parsed = parseLine(current.date, current.rest)
    if (parsed) rows.push(parsed)
  }
  return rows
}

function parseLine(dateStr: string, rest: string): ParsedTx | null {
  // Look for all money tokens. Typical statement row:
  //   "<description> <debit> <credit> <balance>"
  // We treat the LAST money token as balance, the one before it as
  // amount, and infer sign from CR/DR label or position.
  const moneyMatches: { v: number; idx: number; raw: string }[] = []
  let m: RegExpExecArray | null
  const re = new RegExp(MONEY_RE.source, 'g')
  while ((m = re.exec(rest)) !== null) {
    moneyMatches.push({ v: toNumber(m[0]), idx: m.index, raw: m[0] })
  }
  if (moneyMatches.length === 0) return null

  // Strip money tokens out to leave just the description text.
  const description = rest
    .replace(re, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(CR|DR|Credit|Debit)\b/gi, '')
    .trim()

  let amount = 0
  let balance: number | null = null

  if (moneyMatches.length >= 2) {
    balance = moneyMatches[moneyMatches.length - 1].v
    amount = moneyMatches[moneyMatches.length - 2].v
  } else {
    amount = moneyMatches[0].v
  }

  // Sign: prefer explicit CR/DR labels, fall back to keywords.
  if (/\bDR\b|debit|withdraw|payment to|purchase|fees/i.test(rest)) amount = -Math.abs(amount)
  else if (/\bCR\b|credit|deposit|transfer in|received|refund/i.test(rest)) amount = Math.abs(amount)
  // If still ambiguous, leave as-is.

  // Reference numbers — most banks include a tx ID. Grab the longest
  // numeric/alphanumeric token after the date.
  const refMatch = description.match(/\b[A-Z0-9]{6,}\b/)
  const reference = refMatch ? refMatch[0] : null

  return {
    transaction_date: dateStr,
    description: description.slice(0, 500),
    amount,
    balance_after: balance,
    reference,
  }
}

export async function ingestBankStatement(input: {
  file_path: string
  bank_name?: string | null
  account_label?: string | null
  account_iban?: string | null
}): Promise<{ ok: true; upload_id: string; tx_count: number } | { ok: false; error: string }> {
  try {
    const me = await getCurrentUser()
    if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }

    const sb = agentSupabase()

    // Download the PDF server-side. Storage paths sometimes include the
    // bucket prefix when copy-pasted from the dashboard — strip it.
    let storagePath = input.file_path
    if (storagePath.startsWith(`${BUCKET}/`)) storagePath = storagePath.slice(BUCKET.length + 1)
    const { data: blob, error: dlErr } = await sb.storage.from(BUCKET).download(storagePath)
    if (dlErr || !blob) {
      return { ok: false, error: `Cannot download from storage: ${dlErr?.message ?? 'no blob'}` }
    }

    // unpdf — same lib the WhatsApp agent uses
    const { extractText } = await import('unpdf')
    const buffer = new Uint8Array(await blob.arrayBuffer())
    const { text: pages } = await extractText(buffer, { mergePages: true })
    const rawText = (Array.isArray(pages) ? pages.join('\n') : String(pages || '')).slice(0, 1_000_000)

    const transactions = parseStatementText(rawText)
    if (transactions.length === 0) {
      // Still record the upload so admin can inspect raw_text and re-parse.
      const { data: failed } = await sb.from('bank_statement_uploads').insert({
        file_path: input.file_path,
        bank_name: input.bank_name ?? null,
        account_label: input.account_label ?? null,
        account_iban: input.account_iban ?? null,
        raw_text: rawText,
        status: 'failed',
        parse_error: 'No transactions parsed from text. Likely an image-only PDF or an unsupported bank layout.',
        uploaded_by: me.id,
        total_transactions: 0,
      }).select('id').single()
      return { ok: false, error: `Parsed 0 transactions. Upload id: ${(failed as any)?.id}` }
    }

    // Period from first & last dated row
    const dated = transactions.filter((t) => t.transaction_date).map((t) => t.transaction_date as string).sort()
    const period_from = dated[0] ?? null
    const period_to = dated[dated.length - 1] ?? null

    const { data: upload, error: insErr } = await sb.from('bank_statement_uploads').insert({
      file_path: input.file_path,
      bank_name: input.bank_name ?? null,
      account_label: input.account_label ?? null,
      account_iban: input.account_iban ?? null,
      period_from,
      period_to,
      raw_text: rawText.slice(0, 100_000),
      status: 'parsed',
      total_transactions: transactions.length,
      uploaded_by: me.id,
    }).select('id').single()
    if (insErr || !upload) return { ok: false, error: `Insert upload row failed: ${insErr?.message}` }

    const uploadId = (upload as any).id as string
    const rows = transactions.map((t) => ({
      statement_upload_id: uploadId,
      transaction_date: t.transaction_date,
      description: t.description,
      amount: t.amount,
      balance_after: t.balance_after,
      reference: t.reference,
      match_confidence: 'unmatched' as const,
    }))
    const { error: txErr } = await sb.from('bank_transactions').insert(rows)
    if (txErr) return { ok: false, error: `Insert transactions failed: ${txErr.message}` }

    // Auto-match
    await autoMatchTransactions(uploadId)

    revalidatePath('/accounting/reconciliation')
    revalidatePath(`/accounting/reconciliation/${uploadId}`)
    return { ok: true, upload_id: uploadId, tx_count: transactions.length }
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unexpected error' }
  }
}

// Score-based matching: scans unmatched transactions, finds invoice/bill
// candidates within a few days with the same total. High confidence when
// reference matches too; low confidence when only amount agrees.
export async function autoMatchTransactions(uploadId: string): Promise<{ matched: number }> {
  const sb = agentSupabase()
  const { data: txs } = await sb
    .from('bank_transactions')
    .select('id, transaction_date, amount, reference, description, match_confidence')
    .eq('statement_upload_id', uploadId)
    .eq('match_confidence', 'unmatched')
  if (!txs?.length) return { matched: 0 }

  // Pre-fetch candidate windows — anything within ±10 days of the
  // statement's overall span. Keeps the matcher in-memory after one
  // round-trip per side.
  const dates = (txs as any[]).map((t: any) => t.transaction_date).filter(Boolean).sort()
  const from = dates[0]
  const to = dates[dates.length - 1]
  if (!from || !to) return { matched: 0 }
  const fromBuf = bumpDate(from, -10)
  const toBuf = bumpDate(to, +10)

  const [{ data: invs }, { data: bills }] = await Promise.all([
    sb.from('accounting_invoices')
      .select('id, invoice_number, customer_name, total, payment_date, payment_reference, issue_date')
      .gte('issue_date', fromBuf).lte('issue_date', toBuf)
      .in('status', ['approved', 'pushed']),
    sb.from('accounting_bills')
      .select('id, bill_reference, vendor_name, total, payment_date, payment_reference, issue_date')
      .gte('issue_date', fromBuf).lte('issue_date', toBuf)
      .in('status', ['approved', 'pushed', 'paid']),
  ])

  let matched = 0
  for (const tx of txs as any[]) {
    const isCredit = Number(tx.amount) > 0
    const abs = Math.abs(Number(tx.amount))
    if (!abs || !tx.transaction_date) continue

    const pool: any[] = isCredit ? (invs ?? []) : (bills ?? [])
    // Exact amount + reference match → auto_high
    let candidate: any = null
    let confidence: 'auto_high' | 'auto_low' | null = null

    for (const c of pool) {
      const ctotal = Math.abs(Number(c.total ?? 0))
      if (Math.abs(ctotal - abs) > 0.5) continue
      // Date sanity: within 7 days of issue_date (or payment_date if set)
      const refDate = c.payment_date || c.issue_date
      if (!refDate || Math.abs(daysBetween(refDate, tx.transaction_date)) > 7) continue
      // Reference match?
      const refsAgree = tx.reference && c.payment_reference && tx.reference === c.payment_reference
      if (refsAgree) {
        candidate = c; confidence = 'auto_high'; break
      } else if (!candidate) {
        candidate = c; confidence = 'auto_low'
      }
    }

    if (candidate && confidence) {
      const patch: Record<string, any> = { match_confidence: confidence }
      if (isCredit) patch.matched_invoice_id = candidate.id
      else patch.matched_bill_id = candidate.id
      await sb.from('bank_transactions').update(patch).eq('id', tx.id)
      matched++
    }
  }

  // Update the parent counter
  await sb.from('bank_statement_uploads').update({
    matched_count: matched,
    status: matched > 0 ? 'reconciling' : 'parsed',
  }).eq('id', uploadId)

  return { matched }
}

function bumpDate(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00Z').getTime()
  const db = new Date(b + 'T00:00:00Z').getTime()
  return Math.round((db - da) / 86400000)
}

// Manual override — admin links a transaction to a specific invoice/bill.
export async function manualMatch(
  txId: string,
  target: { invoice_id?: string | null; bill_id?: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const sb = agentSupabase()

  const patch: Record<string, any> = {
    matched_invoice_id: target.invoice_id ?? null,
    matched_bill_id: target.bill_id ?? null,
    match_confidence: (target.invoice_id || target.bill_id) ? 'manual' : 'unmatched',
  }
  const { error } = await sb.from('bank_transactions').update(patch).eq('id', txId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/reconciliation')
  return { ok: true }
}

// Mark the whole statement reconciled when admin's done reviewing.
export async function finalizeReconciliation(uploadId: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const me = await getCurrentUser()
  if (me?.profile?.role !== 'admin') return { ok: false, error: 'Admin only.' }
  const sb = agentSupabase()
  const { error } = await sb.from('bank_statement_uploads').update({ status: 'reconciled' }).eq('id', uploadId)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/accounting/reconciliation')
  return { ok: true }
}
