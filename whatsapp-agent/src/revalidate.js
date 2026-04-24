// Notify the Next.js dashboard to invalidate its server cache after we write
// to Supabase. Failures are logged and swallowed — we never want a dashboard
// hiccup to make the WhatsApp write look like it failed.

const url = () => process.env.DASHBOARD_URL
const secret = () => process.env.REVALIDATE_SECRET

export async function revalidate(paths) {
  if (!paths || paths.length === 0) return
  if (!url() || !secret()) return // Not configured — skip silently.

  try {
    const res = await fetch(`${url().replace(/\/$/, '')}/api/revalidate`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-revalidate-secret': secret(),
      },
      body: JSON.stringify({ paths }),
    })
    if (!res.ok) {
      console.error(`revalidate: ${res.status} ${await res.text().catch(() => '')}`)
    }
  } catch (err) {
    console.error('revalidate failed:', err?.message ?? err)
  }
}
