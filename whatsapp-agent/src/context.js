// Per-message context, threaded through the agent loop using
// AsyncLocalStorage so tool executors can know WHICH user is on the
// other end of the conversation without every executor signature
// growing a `sender` parameter.
//
// Usage:
//   import { withRequest, getRequest } from './context.js'
//   await withRequest({ senderJid: 'xxx@lid' }, () => handleMessage(...))
//   // later, deep inside an executor:
//   const ctx = getRequest()  // { senderJid: 'xxx@lid' } or undefined

import { AsyncLocalStorage } from 'node:async_hooks'

const _store = new AsyncLocalStorage()

export function withRequest(ctx, fn) {
  return _store.run(ctx, fn)
}

export function getRequest() {
  return _store.getStore()
}
