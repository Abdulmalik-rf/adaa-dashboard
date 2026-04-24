import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'

// Long-term, cross-session memory. Stored alongside the baileys session so
// it survives agent restarts but gets wiped if you intentionally delete the
// auth dir to re-link. Each entry is tiny (one line of text) — the whole
// file is kept in memory and injected into every system prompt.

const FILE = path.join('./baileys_auth', 'agent_memories.json')
const MAX_FACTS = 25
const MAX_FACT_LEN = 200

/** @type {{ id: string; text: string; created_at: string }[] | null} */
let cache = null

async function load() {
  if (cache !== null) return cache
  try {
    const data = await fs.readFile(FILE, 'utf-8')
    const arr = JSON.parse(data)
    cache = Array.isArray(arr) ? arr : []
  } catch {
    cache = []
  }
  return cache
}

async function persist() {
  if (cache === null) return
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true })
    await fs.writeFile(FILE, JSON.stringify(cache, null, 2))
  } catch (err) {
    console.error('[memory-store] save failed:', err?.message ?? err)
  }
}

export async function listFacts() {
  return await load()
}

export async function rememberFact(text) {
  const list = await load()
  const trimmed = String(text ?? '').trim()
  if (!trimmed) throw new Error('fact text is empty')
  if (trimmed.length > MAX_FACT_LEN) {
    throw new Error(`fact too long (${trimmed.length} chars, max ${MAX_FACT_LEN}). Summarize first.`)
  }
  // Dedupe by exact text (case-insensitive) so the model can't spam the same thing.
  const lower = trimmed.toLowerCase()
  const dup = list.find((f) => f.text.toLowerCase() === lower)
  if (dup) return { ...dup, warning: 'already saved, not duplicated' }

  if (list.length >= MAX_FACTS) {
    return {
      warning: `memory full (${MAX_FACTS} facts). Tell the user which existing memories to forget_fact(id) before saving new ones.`,
    }
  }

  const entry = {
    id: 'mem_' + crypto.randomBytes(4).toString('hex'),
    text: trimmed,
    created_at: new Date().toISOString(),
  }
  list.push(entry)
  await persist()
  return entry
}

export async function forgetFact(id) {
  const list = await load()
  const before = list.length
  cache = list.filter((m) => m.id !== id)
  await persist()
  return { deleted: before !== cache.length, id }
}
