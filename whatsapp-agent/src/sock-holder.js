// Module-level holder for the baileys socket + the configured notify JIDs.
// Tool executors (which can't see index.js's sock directly) import this so
// they can send documents / messages on the user's behalf after writes.
//
// With multi-user support, getSock() prefers the JID of whoever is
// currently messaging the bot (read from the AsyncLocalStorage request
// context). It falls back to the first configured notify JID otherwise —
// useful for scheduler-driven sends that aren't tied to a request.

import { getRequest } from './context.js'

let _sock = null
let _notifyJids = []     // ordered list, e.g. ['48258353254547@lid', '966541388964@s.whatsapp.net']

export function setSock(sock, notifyJids) {
  _sock = sock
  _notifyJids = Array.isArray(notifyJids) ? [...notifyJids] : [notifyJids]
}

// Resolve the JID to send messages TO right now. Prefer the current request's
// sender (so PDFs go back to whoever asked for them). Fall back to the first
// configured notify JID for non-request-bound flows.
function resolveJid() {
  const ctx = getRequest()
  if (ctx?.senderJid) return ctx.senderJid
  return _notifyJids[0] ?? null
}

export function getSock() {
  const userJid = resolveJid()
  if (!_sock || !userJid) {
    throw new Error('WhatsApp socket is not ready yet')
  }
  return { sock: _sock, userJid }
}

export function isReady() {
  return _sock !== null && _notifyJids.length > 0
}

// All configured notify JIDs (used by the scheduler for fallback broadcasts
// when a reminder has no specific notify_jid attached).
export function getAllNotifyJids() {
  return [..._notifyJids]
}
