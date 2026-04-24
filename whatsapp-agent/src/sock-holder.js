// Module-level holder for the baileys socket + the user's JID.
// Tool executors (which can't see index.js's sock directly) import this so
// they can send documents / messages on the user's behalf after writes.

let _sock = null
let _userJid = null

export function setSock(sock, userJid) {
  _sock = sock
  _userJid = userJid
}

export function getSock() {
  if (!_sock || !_userJid) {
    throw new Error('WhatsApp socket is not ready yet')
  }
  return { sock: _sock, userJid: _userJid }
}

export function isReady() {
  return _sock !== null && _userJid !== null
}
