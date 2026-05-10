// Cross-origin allowlist + header helper for API routes that the public
// Emergize website (and local dev) calls directly from the browser.
//
// Usage:
//   const cors = corsHeaders(req.headers.get('origin'))
//   return NextResponse.json(data, { headers: cors })
//
// Origins not in ALLOWED_ORIGINS get NO Access-Control-Allow-Origin header
// (the browser then blocks the response). Don't echo arbitrary origins.

export const ALLOWED_ORIGINS = [
  'https://emergize-sa.com',
  'https://www.emergize-sa.com',
  'http://localhost:3000',
] as const

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (origin && (ALLOWED_ORIGINS as readonly string[]).includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin
  }
  return headers
}
